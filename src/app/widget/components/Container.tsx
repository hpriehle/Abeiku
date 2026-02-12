import { cn } from "./cn";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}

export function Container({ children, className, wide }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 md:px-10 lg:px-16",
        wide ? "max-w-[1440px]" : "max-w-[1280px]",
        className
      )}
    >
      {children}
    </div>
  );
}
