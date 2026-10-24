import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-white",
        secondary: "border-primary/10 bg-primary/[0.06] text-primary",
        success: "border-success/15 bg-success/[0.08] text-success",
        warning: "border-warning/20 bg-warning/[0.08] text-warning",
        error: "border-error/15 bg-error/[0.07] text-error",
        outline: "border-line text-text-main",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & 
  VariantProps<typeof badgeVariants> & {
    className?: string;
  };

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
