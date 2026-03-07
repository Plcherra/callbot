"use client";

import { Check, Copy, PhoneCall } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";

type SuccessState = { id: string; phoneNumber?: string; name: string };

type Props = {
  successState: SuccessState;
  copied: boolean;
  onCopy: () => void;
  onViewReceptionist: () => void;
  onDismiss: () => void;
};

export function SuccessStep({ successState, copied, onCopy, onViewReceptionist, onDismiss }: Props) {
  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
          <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-lg font-semibold">Receptionist created!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          &quot;{successState.name}&quot; is ready to take calls.
        </p>
      </div>
      {successState.phoneNumber && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">Your new number</p>
            <p className="text-lg font-mono tracking-wide">{successState.phoneNumber}</p>
            <div className="flex gap-2 flex-wrap">
              <Button asChild size="sm">
                <a href={`tel:${successState.phoneNumber}`}>
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Call now
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={onCopy}>
                {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied!" : "Copy number"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onDismiss}>Done</Button>
        {successState.id && (
          <Button onClick={onViewReceptionist}>View receptionist</Button>
        )}
      </div>
    </div>
  );
}
