"use client";

import { cn } from "./cn";
import { FadeIn } from "./FadeIn";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  theme?: "light" | "dark";
  className?: string;
}

export function SectionHeading({
  title,
  subtitle,
  align = "center",
  theme = "light",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-12 md:mb-16",
        align === "center" && "text-center",
        className
      )}
    >
      <FadeIn>
        <h2
          className={cn(
            "font-heading text-h2 font-light",
            theme === "dark" ? "text-cream" : "text-black"
          )}
        >
          {title}
        </h2>
      </FadeIn>
      {subtitle && (
        <FadeIn delay={0.15}>
          <p
            className={cn(
              "mt-4 max-w-2xl font-body text-body-lg font-light",
              align === "center" && "mx-auto",
              theme === "dark" ? "text-cream/70" : "text-gray"
            )}
          >
            {subtitle}
          </p>
        </FadeIn>
      )}
    </div>
  );
}
