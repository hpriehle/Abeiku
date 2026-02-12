import Link from "next/link";
import { cn } from "./cn";

interface ButtonProps {
  children: React.ReactNode;
  href?: string;
  external?: boolean;
  target?: string;
  rel?: string;
  variant?: "primary" | "outline" | "ghost" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
}

export function Button({
  children,
  href,
  external,
  target,
  rel,
  variant = "primary",
  size = "md",
  className,
  onClick,
  type = "button",
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center rounded font-body font-medium tracking-wide uppercase transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green";

  const variants = {
    primary: "bg-green text-white hover:bg-green-light",
    outline: "border border-green text-green hover:bg-green hover:text-white",
    ghost: "text-green hover:text-green-light",
    dark: "border border-cream/50 text-cream hover:bg-cream hover:text-black",
  };

  const sizes = {
    sm: "px-5 py-2 text-xs",
    md: "px-7 py-3 text-small",
    lg: "px-9 py-4 text-body",
  };

  const classes = cn(baseStyles, variants[variant], sizes[size], className);

  if (href && external) {
    return (
      <a href={href} target={target} rel={rel} className={classes}>
        {children}
      </a>
    );
  }

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
