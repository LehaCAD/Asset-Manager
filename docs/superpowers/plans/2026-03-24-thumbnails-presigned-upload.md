# Thumbnail System + Presigned Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offload thumbnail generation to browser for uploads, add two thumbnail sizes (small 256px + medium 800px), and replace server-proxied uploads with presigned S3 URLs — eliminating file IO from the VPS.

**Architecture:** Two independent flows. Uploads: browser resizes on canvas → presigned PUT to S3 → server records URLs in DB. Generations: server makes thumbnails via Pillow/ffmpeg from temp file it already has. New `preview_url` field on Element for medium size. Two-phase complete endpoint with HEAD verification.

**Tech Stack:** Django 5, DRF, boto3 (presigned URLs), Pillow (image resize), ffmpeg (video frames), Next.js 14, Canvas API, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-03-24-thumbnails-presigned-upload-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `backend/apps/common/thumbnail_utils.py` | Pillow/ffmpeg resize logic, returns local file paths |
| `backend/apps/common/presigned.py` | boto3 presigned URL generation (isolated from default_storage) |
| `backend/apps/elements/views_upload.py` | `presign` + `complete` endpoints |
| `backend/apps/elements/tests/test_thumbnails.py` | Tests for thumbnail_utils |
| `backend/apps/elements/tests/test_presigned.py` | Tests for presign + complete endpoints |
| `frontend/lib/utils/client-resize.ts` | Canvas resize logic (image + video) |
| `frontend/lib/utils/client-upload.ts` | Presign → S3 PUT → complete orchestration |
| `frontend/lib/api/upload.ts` | API calls: presign, complete |

### Modified files
| File | What changes |
|------|-------------|
| `backend/apps/elements/models.py` | Add `preview_url`, `upload_keys`, `STATUS_UPLOADING` |
| `backend/apps/elements/serializers.py` | Add `preview_url` to serializer fields |
| `backend/apps/elements/tasks.py` | Update `notify_element_status`, `generate_upload_thumbnail` |
| `backend/apps/common/generation.py` | Update `finalize_generation_success` to generate thumbnails |
| `backend/apps/scenes/s3_utils.py` | Minor: null scene_id handling in existing functions |
| `backend/apps/projects/consumers.py` | Add `preview_url` to WS payload |
| `backend/config/urls.py` | Register new upload endpoints |
| `backend/requirements.txt` | Add `Pillow==10.4.0` |
| `frontend/lib/types/index.ts` | Add `UPLOADING` status, `preview_url` field, WS event field |
| `frontend/lib/store/scene-workspace.ts` | Replace `processUploadQueue` internals |
| `frontend/lib/api/scenes.ts` | Keep old upload (fallback), add presign |
| `frontend/components/element/ElementCard.tsx` | Ensure uses `thumbnail_url` (already does) |
| `frontend/components/lightbox/LightboxModal.tsx` | Use `preview_url` instead of `file_url` |

---

## Task 0: Spike — Verify Presigned PUT on Timeweb S3

**Files:**
- None (manual verification in Docker shell)

This is a **go/no-go gate**. If presigned PUT doesn't work on Timeweb S3, the upload flow falls back to approach B (client makes thumbnails, sends via FormData through server).

- [ ] **Step 1: Generate a presigned PUT URL from Django shell**

```bash
docker compose exec backend python manage.py shell
```

```python
import boto3
from django.conf import settings

client = boto3.client(
    's3',
    endpoint_url=settings.AWS_S3_ENDPOINT_URL,
    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    region_name=settings.AWS_S3_REGION_NAME,
)

url = client.generate_presigned_url(
    'put_object',
    Params={
        'Bucket': settings.AWS_STORAGE_BUCKET_NAME,
        'Key': 'test/presigned-spike.txt',
        'ContentType': 'text/plain',
    },
    ExpiresIn=900,
)
print(url)
```

- [ ] **Step 2: Test presigned PUT via curl**

```bash
curl -X PUT -H "Content-Type: text/plain" -d "hello presigned" "<PRESIGNED_URL>"
```

Expected: HTTP 200. If 403 or signature error — presigned PUT not supported, stop and fallback.

- [ ] **Step 3: Configure CORS on Timeweb S3 bucket**

Via Timeweb panel or boto3, set CORS policy:
```json
{
  "AllowedOrigins": ["https://raskadrawka.ru", "http://localhost:3000"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["Content-Type"]
}
```

- [ ] **Step 4: Test from browser (CORS)**

Open browser console at `http://localhost:3000`:
```javascript
fetch("<PRESIGNED_URL>", {
  method: "PUT",
  headers: { "Content-Type": "text/plain" },
  body: "hello from browser",
}).then(r => console.log(r.status))
```

Expected: 200. If CORS error — configure bucket CORS first, retry.

- [ ] **Step 5: Clean up test file**

```bash
docker compose exec backend python manage.py shell -c "
from django.core.files.storage import default_storage
default_storage.delete('test/presigned-spike.txt')
"
```

- [ ] **Step 6: Document result**

If all passed — proceed with plan. If failed — document the error and switch to approach B.

---

## Task 1: Element Model — Add Fields + Migration

**Files:**
- Modify: `backend/apps/elements/models.py:17-27` (STATUS choices), `:64-73` (url fields), `:133-137` (file_size area)
- Create: `backend/apps/elements/migrations/0010_add_preview_url_upload_keys_uploading_status.py` (auto-generated)

- [ ] **Step 1: Add UPLOADING status to Element model**

In `backend/apps/elements/models.py`, add after existing status constants (~line 27):

```python
STATUS_UPLOADING = 'UPLOADING'
```

Update STATUS_CHOICES to include it:
```python
(STATUS_UPLOADING, 'Загрузка'),
```

- [ ] **Step 2: Add preview_url and upload_keys fields**

After `thumbnail_url` field (~line 73):
```python
preview_url = models.URLField(max_length=500, blank=True, default='')
```

After `file_size` field (~line 137):
```python
upload_keys = models.JSONField(null=True, blank=True, help_text='S3 keys for presigned upload: {original, small, medium}')
```

- [ ] **Step 3: Generate and run migration**

```bash
docker compose exec backend python manage.py makemigrations elements --name add_preview_url_upload_keys_uploading_status
docker compose exec backend python manage.py migrate
```

Expected: Migration applies cleanly, no data loss.

- [ ] **Step 4: Verify in shell**

```bash
docker compose exec backend python manage.py shell -c "
from apps.elements.models import Element
print(Element.STATUS_UPLOADING)
e = Element.objects.first()
print(hasattr(e, 'preview_url'), hasattr(e, 'upload_keys'))
"
```

Expected: `UPLOADING`, `True True`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/elements/models.py backend/apps/elements/migrations/
git commit -m "feat: add preview_url, upload_keys, UPLOADING status to Element model"
```

---

## Task 2: Serializer + WebSocket — Add preview_url

**Files:**
- Modify: `backend/apps/elements/serializers.py:19-46` (fields list)
- Modify: `backend/apps/elements/tasks.py:32-58` (notify_element_status)
- Modify: `backend/apps/projects/consumers.py:50-57` (element_status_changed handler)

- [ ] **Step 1: Add preview_url to ElementSerializer**

In `backend/apps/elements/serializers.py`, add `preview_url` to the Meta fields list.

- [ ] **Step 2: Add preview_url to notify_element_status**

In `backend/apps/elements/tasks.py`, update `notify_element_status` (~line 32-58) to accept and forward `preview_url`:

```python
def notify_element_status(element: Element, status: str, file_url: str = '', error_message: str = '', preview_url: str = '') -> None:
```

Add to the group_send payload:
```python
'preview_url': preview_url or element.preview_url or '',
```

- [ ] **Step 3: Add preview_url to WebSocket consumer**

In `backend/apps/projects/consumers.py`, update `element_status_changed` handler (~line 50-57) to forward `preview_url`:

```python
'preview_url': event.get('preview_url', ''),
```

- [ ] **Step 4: Verify serializer returns preview_url**

```bash
docker compose exec backend python manage.py shell -c "
from apps.elements.models import Element
from apps.elements.serializers import ElementSerializer
e = Element.objects.first()
data = ElementSerializer(e).data
print('preview_url' in data)
"
```

Expected: `True`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/elements/serializers.py backend/apps/elements/tasks.py backend/apps/projects/consumers.py
git commit -m "feat: add preview_url to serializer, WebSocket notify, and consumer"
```

---

## Task 3: Presigned URL Generator

**Files:**
- Create: `backend/apps/common/presigned.py`
- Modify: `backend/apps/scenes/s3_utils.py` (add `get_public_url` helper)

- [ ] **Step 1: Create presigned.py**

```python
# backend/apps/common/presigned.py
import uuid
import boto3
from django.conf import settings

PRESIGN_TTL = 900  # 15 minutes

ALLOWED_CONTENT_TYPES = {
    'IMAGE': ['image/jpeg', 'image/png', 'image/webp'],
    'VIDEO': ['video/mp4', 'video/webm', 'video/quicktime'],
}


def _get_s3_client():
    """Dedicated boto3 client for presigned URLs (not default_storage)."""
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )


EXTENSION_TO_CONTENT_TYPE = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
}


def generate_upload_presigned_urls(
    project_id: int,
    scene_id: int | None,
    filename: str,
    element_type: str,
) -> dict:
    """
    Generate 3 presigned PUT URLs for original + small + medium.
    Returns: {upload_keys: {...}, presigned_urls: {...}, content_types: {...}}
    """
    client = _get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    ext = _get_extension(filename)
    uid = uuid.uuid4().hex

    # S3 key prefix
    if scene_id:
        prefix = f"projects/{project_id}/scenes/{scene_id}"
    else:
        prefix = f"projects/{project_id}/root"

    keys = {
        'original': f"{prefix}/{uid}{ext}",
        'small': f"{prefix}/{uid}_sm.jpg",
        'medium': f"{prefix}/{uid}_md.jpg",
    }

    # Content-Type for original derived from actual file extension (not hardcoded)
    original_ct = EXTENSION_TO_CONTENT_TYPE.get(ext, 'application/octet-stream')
    thumb_ct = 'image/jpeg'

    content_types = {}
    presigned_urls = {}
    for variant, key in keys.items():
        ct = original_ct if variant == 'original' else thumb_ct
        content_types[variant] = ct
        presigned_urls[variant] = client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket,
                'Key': key,
                'ContentType': ct,
            },
            ExpiresIn=PRESIGN_TTL,
        )

    return {
        'upload_keys': keys,
        'presigned_urls': presigned_urls,
        'content_types': content_types,  # frontend must use these exact types in PUT
        'expires_in': PRESIGN_TTL,
    }


def head_s3_object(key: str) -> dict | None:
    """HEAD request to verify object exists. Returns {size, content_type} or None."""
    client = _get_s3_client()
    try:
        resp = client.head_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=key,
        )
        return {
            'size': resp['ContentLength'],
            'content_type': resp['ContentType'],
        }
    except client.exceptions.ClientError:
        return None


def get_public_url(key: str) -> str:
    """Build public URL for an S3 key."""
    domain = settings.AWS_S3_CUSTOM_DOMAIN
    return f"https://{domain}/{key}"


def _get_extension(filename: str) -> str:
    if '.' in filename:
        return '.' + filename.rsplit('.', 1)[1].lower()
    return ''
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/common/presigned.py
git commit -m "feat: add presigned URL generator with HEAD verification"
```

---

## Task 4: Presign + Complete Endpoints

**Files:**
- Create: `backend/apps/elements/views_upload.py`
- Modify: `backend/config/urls.py` (register new endpoints)
- Modify: `backend/apps/scenes/views.py` (add presign action)
- Modify: `backend/apps/projects/views.py` (add presign action)

- [ ] **Step 1: Create views_upload.py with complete endpoint**

```python
# backend/apps/elements/views_upload.py
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.elements.models import Element
from apps.elements.serializers import ElementSerializer
from apps.elements.tasks import notify_element_status
from apps.common.presigned import head_s3_object, get_public_url

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_complete(request, element_id):
    """Two-phase upload completion: 'thumbnail' then 'final'."""
    try:
        element = Element.objects.select_related('project').get(
            id=element_id,
            project__user=request.user,
            status=Element.STATUS_UPLOADING,
        )
    except Element.DoesNotExist:
        return Response({'error': 'Element not found or not in UPLOADING status'}, status=status.HTTP_404_NOT_FOUND)

    phase = request.data.get('phase')
    keys = element.upload_keys or {}

    if phase == 'thumbnail':
        element.thumbnail_url = get_public_url(keys.get('small', ''))
        element.save(update_fields=['thumbnail_url', 'updated_at'])
        notify_element_status(element, 'UPLOADING', preview_url='')
        return Response(ElementSerializer(element).data)

    elif phase == 'final':
        # HEAD check on original
        original_key = keys.get('original', '')
        head = head_s3_object(original_key)
        if not head:
            return Response(
                {'error': 'Original file not found in S3'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        element.file_url = get_public_url(original_key)
        element.preview_url = get_public_url(keys.get('medium', ''))
        element.file_size = head['size']
        element.status = Element.STATUS_COMPLETED
        element.save(update_fields=[
            'file_url', 'preview_url', 'file_size', 'status', 'updated_at',
        ])
        notify_element_status(
            element, 'COMPLETED',
            file_url=element.file_url,
            preview_url=element.preview_url,
        )
        return Response(ElementSerializer(element).data)

    return Response({'error': 'Invalid phase'}, status=status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 2: Add presign action to SceneViewSet**

In `backend/apps/scenes/views.py`, add a new action after the existing `upload` action (~line 207):

```python
@action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsProjectOwner])
def presign(self, request, pk=None):
    """Generate presigned URLs for direct S3 upload."""
    scene = self.get_object()
    from apps.common.presigned import generate_upload_presigned_urls
    from apps.elements.models import Element
    from apps.scenes.s3_utils import validate_file_type, detect_element_type

    filename = request.data.get('filename', '')
    file_size = request.data.get('file_size', 0)

    if not validate_file_type(filename):
        return Response(
            {'error': 'Неподдерживаемый формат файла'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    element_type = detect_element_type(filename)

    result = generate_upload_presigned_urls(
        project_id=scene.project_id,
        scene_id=scene.id,
        filename=filename,
        element_type=element_type,
    )

    # Calculate order_index (append to end)
    current_count = Element.objects.filter(
        project=scene.project, scene=scene,
    ).count()

    # Create Element in UPLOADING status
    element = Element.objects.create(
        project=scene.project,
        scene=scene,
        element_type=element_type,
        status=Element.STATUS_UPLOADING,
        source_type=Element.SOURCE_UPLOADED,
        upload_keys=result['upload_keys'],
        prompt_text=request.data.get('prompt_text', ''),
        order_index=current_count,
    )

    return Response({
        'element_id': element.id,
        **result,
    })
```

- [ ] **Step 3: Add presign action to ProjectViewSet**

Same pattern in `backend/apps/projects/views.py`, with `scene_id=None`.

- [ ] **Step 4: Register complete endpoint in element URLs**

In `backend/apps/elements/urls.py` (following existing routing convention), add:
```python
from apps.elements.views_upload import upload_complete

urlpatterns = [
    # ... existing ...
    path('<int:element_id>/complete/', upload_complete, name='upload-complete'),
]
```

This keeps the route at `/api/elements/{id}/complete/` consistent with the existing element URL namespace.

- [ ] **Step 5: Test presign endpoint manually**

```bash
docker compose exec backend python manage.py shell -c "
from django.test import RequestFactory
from apps.scenes.views import SceneViewSet
# Quick smoke test that presign action exists
print(hasattr(SceneViewSet, 'presign'))
"
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/elements/views_upload.py backend/apps/scenes/views.py backend/apps/projects/views.py backend/config/urls.py
git commit -m "feat: add presign and complete endpoints for direct S3 upload"
```

---

## Task 5: Server-Side Thumbnail Utils (Pillow + ffmpeg)

**Files:**
- Create: `backend/apps/common/thumbnail_utils.py`
- Modify: `backend/requirements.txt` (add Pillow)

- [ ] **Step 1: Add Pillow to requirements.txt**

Add to `backend/requirements.txt`:
```
Pillow==10.4.0
```

Rebuild container:
```bash
docker compose up --build backend -d
```

- [ ] **Step 2: Create thumbnail_utils.py**

```python
# backend/apps/common/thumbnail_utils.py
"""
Server-side thumbnail generation for AI-generated elements.
Used only in generation flow (server already has temp file).
Upload flow uses client-side Canvas resize.
"""
import logging
import os
import subprocess
import tempfile
from typing import Optional

from PIL import Image
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

SMALL_SIZE = 256
MEDIUM_SIZE = 800
SMALL_QUALITY = 80
MEDIUM_QUALITY = 85


def generate_thumbnails(
    temp_path: str,
    element_type: str,
    project_id: int,
    scene_id: int | None,
) -> dict:
    """
    Generate small + medium thumbnails from a local temp file.
    Returns: {'thumbnail_url': str, 'preview_url': str}
    Both may be '' on failure (never raises).
    """
    try:
        if element_type == 'IMAGE':
            return _generate_image_thumbnails(temp_path, project_id, scene_id)
        elif element_type == 'VIDEO':
            return _generate_video_thumbnails(temp_path, project_id, scene_id)
    except Exception as e:
        logger.exception("Thumbnail generation failed: %s", e)

    return {'thumbnail_url': '', 'preview_url': ''}


def _generate_image_thumbnails(
    image_path: str, project_id: int, scene_id: int | None,
) -> dict:
    """Resize image to small + medium using Pillow."""
    img = Image.open(image_path)
    img = img.convert('RGB')  # Ensure JPEG-compatible

    result = {}
    for variant, size, quality in [
        ('small', SMALL_SIZE, SMALL_QUALITY),
        ('medium', MEDIUM_SIZE, MEDIUM_QUALITY),
    ]:
        resized = _resize_to_fit(img, size)
        url = _save_thumbnail_to_s3(resized, quality, project_id, scene_id, variant)
        key = 'thumbnail_url' if variant == 'small' else 'preview_url'
        result[key] = url or ''

    return result


def _generate_video_thumbnails(
    video_path: str, project_id: int, scene_id: int | None,
) -> dict:
    """Extract frame via ffmpeg, then resize small. Medium = native frame."""
    frame_fd = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    frame_path = frame_fd.name
    frame_fd.close()
    try:
        subprocess.run(
            ['ffmpeg', '-i', video_path, '-vframes', '1', '-f', 'image2', '-y', frame_path],
            check=True, capture_output=True,
        )

        # Medium = native frame as-is
        with open(frame_path, 'rb') as f:
            medium_content = f.read()
        medium_url = _upload_bytes_to_s3(medium_content, project_id, scene_id, 'md')

        # Small = Pillow resize from frame
        img = Image.open(frame_path)
        img = img.convert('RGB')
        small_img = _resize_to_fit(img, SMALL_SIZE)
        small_url = _save_thumbnail_to_s3(small_img, SMALL_QUALITY, project_id, scene_id, 'small')

        return {
            'thumbnail_url': small_url or '',
            'preview_url': medium_url or '',
        }
    except Exception as e:
        logger.exception("Video thumbnail generation failed: %s", e)
        return {'thumbnail_url': '', 'preview_url': ''}
    finally:
        if os.path.exists(frame_path):
            os.unlink(frame_path)


def _resize_to_fit(img: Image.Image, max_side: int) -> Image.Image:
    """Resize image so longest side = max_side, preserving aspect ratio."""
    w, h = img.size
    if max(w, h) <= max_side:
        return img.copy()
    if w >= h:
        new_w = max_side
        new_h = int(h * max_side / w)
    else:
        new_h = max_side
        new_w = int(w * max_side / h)
    return img.resize((new_w, new_h), Image.LANCZOS)


def _save_thumbnail_to_s3(
    img: Image.Image, quality: int, project_id: int, scene_id: int | None, suffix: str,
) -> Optional[str]:
    """Save Pillow image to S3, return public URL."""
    import io
    import uuid

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=quality)
    buffer.seek(0)

    prefix = f"projects/{project_id}/scenes/{scene_id}" if scene_id else f"projects/{project_id}/root"
    key = f"{prefix}/{uuid.uuid4().hex}_{suffix}.jpg"

    try:
        saved = default_storage.save(key, ContentFile(buffer.read()))
        return default_storage.url(saved)
    except Exception as e:
        logger.exception("Failed to upload thumbnail to S3: %s", e)
        return None


def _upload_bytes_to_s3(
    content: bytes, project_id: int, scene_id: int | None, suffix: str,
) -> Optional[str]:
    """Upload raw bytes to S3, return public URL."""
    import uuid

    prefix = f"projects/{project_id}/scenes/{scene_id}" if scene_id else f"projects/{project_id}/root"
    key = f"{prefix}/{uuid.uuid4().hex}_{suffix}.jpg"

    try:
        saved = default_storage.save(key, ContentFile(content))
        return default_storage.url(saved)
    except Exception as e:
        logger.exception("Failed to upload bytes to S3: %s", e)
        return None
```

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt backend/apps/common/thumbnail_utils.py
git commit -m "feat: add server-side thumbnail utils (Pillow + ffmpeg)"
```

---

## Task 6: Integrate Thumbnails into Generation Flow

**Files:**
- Modify: `backend/apps/common/generation.py:194-215` (finalize_generation_success)
- Modify: `backend/apps/elements/tasks.py:448-516` (generate_upload_thumbnail)

- [ ] **Step 1: Refactor `_download_and_upload_result` to NOT delete temp file**

In `backend/apps/common/generation.py`, change `_download_and_upload_result` to return `(file_url, file_size, tmp_path)` instead of `(file_url, file_size)`. Remove the `finally: os.unlink(tmp_path)` block — caller is now responsible for cleanup.

```python
def _download_and_upload_result(source_url: str, project_id: int, scene_id: int) -> tuple[str, int, str]:
    """
    Stream file from provider to temp file and upload to S3.
    Returns (file_url, file_size, tmp_path).
    CALLER is responsible for deleting tmp_path.
    """
    parsed_path = urlparse(source_url).path.lower()
    suffix = ".mp4" if parsed_path.endswith(".mp4") else ".jpg"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
        tmp_path = tmp_file.name
        with requests.get(source_url, timeout=120, stream=True) as response:
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    tmp_file.write(chunk)

    file_size = os.path.getsize(tmp_path)
    file_url = upload_staging_to_s3(
        staging_path=tmp_path,
        project_id=project_id,
        scene_id=scene_id,
    )
    return file_url, file_size, tmp_path
```

- [ ] **Step 2: Update finalize_generation_success to generate thumbnails**

In `finalize_generation_success`, change the call and add thumbnail generation + cleanup:

```python
from apps.common.thumbnail_utils import generate_thumbnails

tmp_path = None
try:
    file_url, file_size, tmp_path = _download_and_upload_result(
        source_url=source_url,
        project_id=element.project_id,
        scene_id=element.scene_id,
    )

    # Generate thumbnails from temp file (before cleanup)
    thumbs = generate_thumbnails(
        tmp_path, element.element_type, element.project_id, element.scene_id,
    )
finally:
    if tmp_path and os.path.exists(tmp_path):
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
```

Update `update_payload` to include:
```python
"thumbnail_url": thumbs.get('thumbnail_url') or file_url,  # fallback to original
"preview_url": thumbs.get('preview_url', ''),
```

- [ ] **Step 2: Update generate_upload_thumbnail task for videos**

In `backend/apps/elements/tasks.py`, update `generate_upload_thumbnail` (~line 448) to use `thumbnail_utils` and produce both small + medium:

Replace the existing ffmpeg call with:
```python
from apps.common.thumbnail_utils import generate_thumbnails

thumbs = generate_thumbnails(tmp_path, element.element_type, element.project_id, element.scene_id)

element.thumbnail_url = thumbs.get('thumbnail_url') or ''
element.preview_url = thumbs.get('preview_url') or ''
element.save(update_fields=['thumbnail_url', 'preview_url', 'updated_at'])
```

- [ ] **Step 3: Update notify calls to include preview_url**

All calls to `notify_element_status` in generation flow should pass `preview_url=element.preview_url`.

- [ ] **Step 4: Test generation flow manually**

Trigger a generation, verify that the completed element has both `thumbnail_url` (small) and `preview_url` (medium) populated.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/common/generation.py backend/apps/elements/tasks.py
git commit -m "feat: integrate two-size thumbnails into generation flow"
```

---

## Task 7: Frontend Types + API

**Files:**
- Modify: `frontend/lib/types/index.ts:135-166` (Element, ElementStatus, WS event)
- Create: `frontend/lib/api/upload.ts`

- [ ] **Step 1: Update TypeScript types**

In `frontend/lib/types/index.ts`:

Add `UPLOADING` to ElementStatus (~line 136):
```typescript
export type ElementStatus = "PENDING" | "PROCESSING" | "UPLOADING" | "COMPLETED" | "FAILED";
```

Add `preview_url` to Element interface (~after thumbnail_url):
```typescript
preview_url: string;
```

Add `preview_url` to WSElementStatusChangedEvent (~line 356-365):
```typescript
preview_url?: string;
```

- [ ] **Step 2: Create upload API module**

```typescript
// frontend/lib/api/upload.ts
import { apiClient } from "./client";
import type { Element } from "../types";

interface PresignResponse {
  element_id: number;
  upload_keys: {
    original: string;
    small: string;
    medium: string;
  };
  presigned_urls: {
    original: string;
    small: string;
    medium: string;
  };
  content_types: {
    original: string;
    small: string;
    medium: string;
  };
  expires_in: number;
}

export const uploadApi = {
  async presignForScene(
    sceneId: number,
    data: { filename: string; file_size: number; prompt_text?: string }
  ): Promise<PresignResponse> {
    const res = await apiClient.post(`/api/scenes/${sceneId}/presign/`, data);
    return res.data;
  },

  async presignForProject(
    projectId: number,
    data: { filename: string; file_size: number; prompt_text?: string }
  ): Promise<PresignResponse> {
    const res = await apiClient.post(`/api/projects/${projectId}/presign/`, data);
    return res.data;
  },

  async complete(
    elementId: number,
    phase: "thumbnail" | "final",
    fileSizeHint?: number
  ): Promise<Element> {
    const res = await apiClient.post(`/api/elements/${elementId}/complete/`, {
      phase,
      ...(fileSizeHint ? { file_size: fileSizeHint } : {}),
    });
    return res.data;
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/index.ts frontend/lib/api/upload.ts
git commit -m "feat: add UPLOADING status, preview_url type, upload API module"
```

---

## Task 8: Client-Side Resize Utility

**Files:**
- Create: `frontend/lib/utils/client-resize.ts`

- [ ] **Step 1: Create client-resize.ts**

```typescript
// frontend/lib/utils/client-resize.ts
/**
 * Client-side image/video resize using Canvas API.
 * Generates small (256px) + medium (800px) JPEG thumbnails.
 */

const SMALL_MAX = 256;
const MEDIUM_MAX = 800;
const SMALL_QUALITY = 0.8;
const MEDIUM_QUALITY = 0.85;

interface ResizeResult {
  small: Blob;
  medium: Blob;
}

/**
 * Resize an image file to small + medium thumbnails.
 */
export async function resizeImage(file: File): Promise<ResizeResult> {
  const bitmap = await createImageBitmap(file);
  try {
    const small = await bitmapToBlob(bitmap, SMALL_MAX, SMALL_QUALITY);
    const medium = await bitmapToBlob(bitmap, MEDIUM_MAX, MEDIUM_QUALITY);
    return { small, medium };
  } finally {
    bitmap.close();
  }
}

/**
 * Extract a frame from a video file and resize to small + medium.
 */
export async function resizeVideoFrame(file: File): Promise<ResizeResult> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Не удалось загрузить видео"));
      setTimeout(() => reject(new Error("Таймаут загрузки видео")), 15000);
    });

    // Try seek to 1s, fallback to 0.1s, then 0s
    const frame = await seekAndCapture(video, [1, 0.1, 0]);

    const bitmap = await createImageBitmap(frame);
    try {
      const small = await bitmapToBlob(bitmap, SMALL_MAX, SMALL_QUALITY);
      const medium = await bitmapToBlob(bitmap, MEDIUM_MAX, MEDIUM_QUALITY);
      return { small, medium };
    } finally {
      bitmap.close();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function seekAndCapture(
  video: HTMLVideoElement,
  seekTimes: number[]
): Promise<ImageBitmap> {
  for (const time of seekTimes) {
    try {
      video.currentTime = Math.min(time, video.duration || time);
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject();
        setTimeout(() => reject(), 5000);
      });

      const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      return await createImageBitmap(canvas);
    } catch {
      continue;
    }
  }
  throw new Error("Не удалось извлечь кадр из видео");
}

async function bitmapToBlob(
  bitmap: ImageBitmap,
  maxSide: number,
  quality: number
): Promise<Blob> {
  const { width, height } = bitmap;
  let newW: number, newH: number;

  if (Math.max(width, height) <= maxSide) {
    newW = width;
    newH = height;
  } else if (width >= height) {
    newW = maxSide;
    newH = Math.round((height * maxSide) / width);
  } else {
    newH = maxSide;
    newW = Math.round((width * maxSide) / height);
  }

  const canvas = new OffscreenCanvas(newW, newH);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, newW, newH);
  return await canvas.convertToBlob({ type: "image/jpeg", quality });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/utils/client-resize.ts
git commit -m "feat: add client-side Canvas resize utility (image + video)"
```

---

## Task 9: Client Upload Orchestrator

**Files:**
- Create: `frontend/lib/utils/client-upload.ts`

- [ ] **Step 1: Create client-upload.ts**

```typescript
// frontend/lib/utils/client-upload.ts
/**
 * Orchestrates: resize → presign → PUT S3 → complete.
 * Single entry point for all upload flows.
 */
import { resizeImage, resizeVideoFrame } from "./client-resize";
import { uploadApi } from "../api/upload";
import type { Element } from "../types";

interface UploadOptions {
  sceneId?: number;   // undefined = project root
  projectId: number;
  promptText?: string;
  signal?: AbortSignal;
}

/**
 * Upload a file with client-side thumbnails via presigned URLs.
 * Returns the completed Element after phase=thumbnail (fast).
 * Continues uploading medium + original in background.
 */
export async function clientUploadFile(
  file: File,
  opts: UploadOptions,
  onThumbnailReady?: (element: Element) => void,
): Promise<Element> {
  const isVideo = file.type.startsWith("video/");

  // 1. Client-side resize
  const thumbs = isVideo
    ? await resizeVideoFrame(file)
    : await resizeImage(file);

  // 2. Get presigned URLs
  const presignData = opts.sceneId
    ? await uploadApi.presignForScene(opts.sceneId, {
        filename: file.name,
        file_size: file.size,
        prompt_text: opts.promptText,
      })
    : await uploadApi.presignForProject(opts.projectId, {
        filename: file.name,
        file_size: file.size,
        prompt_text: opts.promptText,
      });

  const { presigned_urls, content_types, element_id } = presignData;

  // 3. Phase 1: Upload small thumbnail → complete(thumbnail)
  await putToS3(presigned_urls.small, thumbs.small, content_types.small, opts.signal);
  const thumbnailElement = await uploadApi.complete(element_id, "thumbnail");

  if (onThumbnailReady) {
    onThumbnailReady(thumbnailElement);
  }

  // 4. Phase 2: Upload medium + original in parallel → complete(final)
  // IMPORTANT: use content_types from presign response (must match exactly)
  await Promise.all([
    putToS3(presigned_urls.medium, thumbs.medium, content_types.medium, opts.signal),
    putToS3(presigned_urls.original, file, content_types.original, opts.signal),
  ]);

  const finalElement = await uploadApi.complete(element_id, "final", file.size);
  return finalElement;
}

async function putToS3(
  url: string,
  body: Blob | File,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
    signal,
  });
  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/utils/client-upload.ts
git commit -m "feat: add client upload orchestrator (resize → presign → S3 → complete)"
```

---

## Task 10: Integrate into Store + Replace Old Upload

**Files:**
- Modify: `frontend/lib/store/scene-workspace.ts:133-175` (processUploadQueue)

- [ ] **Step 1: Update processUploadQueue to use clientUploadFile**

Replace the internals of `processUploadQueue` in `scene-workspace.ts`. The queue structure and optimistic element logic stay the same. Only the upload mechanism changes:

```typescript
// Inside processUploadQueue, replace the scenesApi.upload / projectsApi.uploadToProject call:
import { clientUploadFile } from "../utils/client-upload";

// Replace:
//   const serverElement = item.sceneId > 0
//     ? await scenesApi.upload(item.sceneId, item.file, { signal })
//     : await projectsApi.uploadToProject(item.projectId, item.file, { signal });

// With:
const serverElement = await clientUploadFile(
  item.file,
  {
    sceneId: item.sceneId > 0 ? item.sceneId : undefined,
    projectId: item.projectId,
    signal: currentUploadController?.signal,
  },
  (thumbElement) => {
    // Replace optimistic element as soon as thumbnail is ready
    _replaceOptimistic(item.tempId, thumbElement);
  },
);
// Final replace with completed element (has file_url + preview_url)
_replaceOptimistic(item.tempId, serverElement);
```

- [ ] **Step 2: Keep old upload as fallback**

Do NOT delete `scenesApi.upload` or `projectsApi.uploadToProject`. They serve as fallback if Canvas resize fails (see error handling in spec). Wrap `clientUploadFile` in try/catch:

```typescript
try {
  // New presigned flow
  const serverElement = await clientUploadFile(...);
} catch (resizeError) {
  // Fallback to old FormData flow
  console.warn('Client upload failed, falling back to server upload:', resizeError);
  const serverElement = item.sceneId > 0
    ? await scenesApi.upload(item.sceneId, item.file, { signal })
    : await projectsApi.uploadToProject(item.projectId, item.file, { signal });
  _replaceOptimistic(item.tempId, serverElement);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/store/scene-workspace.ts
git commit -m "feat: integrate presigned upload into workspace store with fallback"
```

---

## Task 11: Frontend Components — Use preview_url

**Files:**
- Modify: `frontend/components/lightbox/LightboxModal.tsx:279-290` (image/video display)
- Modify: `frontend/components/element/ElementCard.tsx` (verify thumbnail_url usage)

- [ ] **Step 1: Add preview_url helper**

In `frontend/lib/utils/` or at the top of LightboxModal, add a helper:

```typescript
function getPreviewUrl(element: Element): string {
  return element.preview_url?.trim() || element.thumbnail_url?.trim() || element.file_url?.trim() || '';
}

function getThumbnailUrl(element: Element): string {
  return element.thumbnail_url?.trim() || element.file_url?.trim() || '';
}
```

- [ ] **Step 2: Update LightboxModal to use preview_url**

In `LightboxModal.tsx`, change the main image display (~line 290):

```typescript
// Was: <img src={currentElement.file_url} ...
// Now:
<img src={getPreviewUrl(currentElement)} ...
```

Add a "Смотреть оригинал" button that opens `currentElement.file_url` in a new tab or triggers download.

- [ ] **Step 3: Verify ElementCard uses thumbnail_url**

ElementCard already uses `element.thumbnail_url` for display. Verify it falls back to `file_url` when `thumbnail_url` is empty (for backward compat with old elements).

- [ ] **Step 4: Update WS event handler to apply preview_url**

In `frontend/components/element/WorkspaceContainer.tsx` and `SceneWorkspace.tsx`, where `element_status_changed` events are handled, ensure `preview_url` and `thumbnail_url` are applied for ALL statuses (not just COMPLETED):

```typescript
// In the WS message handler, update the element update logic:
updateElement(event.element_id, {
  status: event.status,
  ...(event.file_url && { file_url: event.file_url }),
  ...(event.thumbnail_url && { thumbnail_url: event.thumbnail_url }),
  ...(event.preview_url && { preview_url: event.preview_url }),
  ...(event.error_message && { error_message: event.error_message }),
});
```

This ensures UPLOADING status events (from phase=thumbnail) correctly update the element's `thumbnail_url`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/lightbox/LightboxModal.tsx frontend/components/element/ElementCard.tsx
git commit -m "feat: use preview_url in lightbox, add original view button"
```

---

## Task 12: End-to-End Testing

**Files:**
- No new files — manual testing through the app

- [ ] **Step 1: Test image upload**

1. Upload a large PNG (~5MB) via dropzone
2. Verify: grid shows small thumbnail quickly (~10KB)
3. Verify: lightbox shows medium preview (~50KB)
4. Verify: "Смотреть оригинал" opens full image
5. Check S3: 3 files exist (original, _sm.jpg, _md.jpg)
6. Check Element in admin: `thumbnail_url`, `preview_url`, `file_url` all populated

- [ ] **Step 2: Test video upload**

1. Upload an MP4 (~20MB)
2. Verify: grid shows video thumbnail quickly
3. Verify: lightbox shows frame preview
4. Check S3: 3 files (original video, _sm.jpg, _md.jpg)

- [ ] **Step 3: Test AI generation (image)**

1. Generate an image via AI
2. Wait for completion
3. Verify: `thumbnail_url` (small) and `preview_url` (medium) populated
4. Verify: lightbox shows medium, not original

- [ ] **Step 4: Test AI generation (video)**

1. Generate a video via AI
2. Wait for completion
3. Verify: thumbnail extracted, both sizes populated

- [ ] **Step 5: Test backward compatibility**

1. Load a scene with old elements (no preview_url)
2. Verify: grid shows `file_url` as thumbnail (fallback)
3. Verify: lightbox shows `file_url` (fallback)

- [ ] **Step 6: Test fallback (Canvas failure)**

1. In browser, temporarily break `createImageBitmap` (override with throwing function)
2. Upload a file
3. Verify: falls back to old FormData upload
4. Verify: element appears correctly

- [ ] **Step 7: Test tab close during upload**

1. Start uploading a large file
2. Close tab after thumbnail phase but before original finishes
3. Verify: element has `status=UPLOADING`, `thumbnail_url` set, `file_url` empty
4. Verify: grid shows the thumbnail

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "feat: thumbnail system + presigned upload — complete implementation"
```
