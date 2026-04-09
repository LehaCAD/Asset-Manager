'use client';

import { AIModel } from '@/lib/types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface VariantSwitcherProps {
    variants: AIModel[];
    currentId: number;
    uiControl: 'pills' | 'select';
    onSelect: (model: AIModel) => void;
}

export function VariantSwitcher({ variants, currentId, uiControl, onSelect }: VariantSwitcherProps) {
    if (variants.length < 2) return null;

    if (uiControl === 'select') {
        return (
            <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Вариант модели</span>
                <Select
                    value={String(currentId)}
                    onValueChange={(val) => {
                        const model = variants.find(m => m.id === Number(val));
                        if (model) onSelect(model);
                    }}
                >
                    <SelectTrigger className="w-full bg-background h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {variants.map(v => (
                            <SelectItem key={v.id} value={String(v.id)} className="text-xs">
                                {v.variant_label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    // Pills mode
    return (
        <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Вариант модели</span>
            <div className="flex gap-1 rounded-lg bg-background/50 p-1">
                {variants.map(v => (
                    <button
                        key={v.id}
                        onClick={() => onSelect(v)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                            v.id === currentId
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {v.variant_label}
                    </button>
                ))}
            </div>
        </div>
    );
}
