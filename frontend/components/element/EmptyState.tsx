import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  onUploadClick: () => void;
}

export function EmptyState({ onUploadClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <ImagePlus className="h-16 w-16 text-muted-foreground" />
      <h3 className="text-lg font-medium">Здесь пока ничего нет</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Загрузите медиа или сгенерируйте с помощью ИИ
      </p>
      <Button onClick={onUploadClick}>Загрузить файлы</Button>
    </div>
  );
}
