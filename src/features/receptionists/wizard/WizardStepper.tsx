"use client";

import { WIZARD_STEPS } from "./constants";

type Props = {
  step: number;
  setStep: (s: number) => void;
};

export function WizardStepper({ step, setStep }: Props) {
  return (
    <nav aria-label="Add receptionist wizard progress" className="py-4">
      <div className="flex items-center justify-between gap-0.5 text-center">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => s.id < step && setStep(s.id)}
            className="flex flex-1 flex-col items-center cursor-pointer group"
            aria-label={`Go to step ${s.id}: ${s.label}`}
          >
            <div className="flex flex-1 w-full items-center">
              <div
                className={`mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  step > s.id ? "bg-green-600 text-white dark:bg-green-500" :
                  step === s.id ? "border-2 border-primary bg-primary/10 text-primary" :
                  "border border-muted-foreground/40 bg-muted/50 text-muted-foreground"
                }`}
                aria-label={`Step ${s.id} of 6: ${s.label}${step > s.id ? ", completed" : step === s.id ? ", current" : ""}`}
              >
                {step > s.id ? "✓" : s.id}
              </div>
              {i < WIZARD_STEPS.length - 1 && (
                <div className="h-0.5 flex-1 bg-muted min-w-2" aria-hidden="true" />
              )}
            </div>
            <span className={`mt-1.5 text-[10px] font-medium truncate max-w-full ${s.id < step ? "text-muted-foreground group-hover:text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4" id="step-indicator">
        Step {step} of 6: {WIZARD_STEPS[step - 1]?.label}
      </p>
    </nav>
  );
}
