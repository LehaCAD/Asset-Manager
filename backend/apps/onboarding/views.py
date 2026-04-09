from decimal import Decimal

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from .services import OnboardingService
from .models import OnboardingTask, UserTaskCompletion, UserOnboardingState
from .serializers import OnboardingTaskSerializer


class OnboardingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        service = OnboardingService()
        state = service.get_state(user)

        tasks = OnboardingTask.objects.filter(is_active=True).order_by('order')
        completed_map = {
            c.task_id: c
            for c in UserTaskCompletion.objects.filter(user=user, task__is_active=True)
        }

        task_data = []
        total_earned = Decimal('0')
        total_possible = Decimal('0')

        for task in tasks:
            completion = completed_map.get(task.id)
            task.completed = completion is not None
            task.completed_at = completion.completed_at if completion else None
            total_possible += task.reward
            if task.completed:
                total_earned += task.reward
            task_data.append(OnboardingTaskSerializer(task).data)

        return Response({
            'welcome_seen': state.welcome_seen,
            'tasks': task_data,
            'total_earned': total_earned,
            'total_possible': total_possible,
            'completed_count': len([t for t in task_data if t['completed']]),
            'total_count': len(task_data),
        })


class WelcomeSeenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        state, _ = UserOnboardingState.objects.get_or_create(user=request.user)
        state.welcome_seen = True
        state.save(update_fields=['welcome_seen'])
        return Response({'ok': True})


class CompleteTaskView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        task_code = request.data.get('task_code')
        if not task_code:
            return Response({'error': 'task_code required'}, status=status.HTTP_400_BAD_REQUEST)

        task = OnboardingTask.objects.filter(code=task_code, is_active=True).first()
        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)
        if task.trigger_type != 'frontend_action':
            return Response(
                {'error': 'This task is completed automatically by the backend'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = UserTaskCompletion.objects.filter(user=request.user, task=task).first()
        if existing:
            return Response({'ok': True, 'already_completed': True})

        service = OnboardingService()
        completion = service.complete_by_code(request.user, task_code)
        if completion and completion.reward_paid:
            from apps.credits.models import CreditsTransaction
            tx = CreditsTransaction.objects.filter(
                user=request.user,
                reason='onboarding_task',
            ).order_by('-id').first()
            new_balance = str(tx.balance_after) if tx else None
            return Response({
                'ok': True,
                'reward': str(task.reward),
                'new_balance': new_balance,
            })

        return Response({'ok': True})
