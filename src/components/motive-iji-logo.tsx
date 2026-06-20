import Image from "next/image";
import Link from "next/link";

type LogoVariant = "horizontal" | "vertical";

const SIZES: Record<LogoVariant, { width: number; height: number }> = {
  horizontal: { width: 168, height: 44 },
  vertical: { width: 112, height: 132 },
};

export function MotiveIjiLogo({
  variant = "horizontal",
  href,
  className = "",
  priority = false,
}: {
  variant?: LogoVariant;
  href?: string;
  className?: string;
  priority?: boolean;
}) {
  const src =
    variant === "horizontal"
      ? "/brand/motiv-iji-logo-horizontal.png"
      : "/brand/motiv-iji-logo-vertical.png";
  const { width, height } = SIZES[variant];

  const img = (
    <Image
      src={src}
      alt="Motiv-iji モチベイジ"
      width={width}
      height={height}
      priority={priority}
      className={`h-auto w-auto max-w-full object-contain ${className}`}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center no-underline">
        {img}
      </Link>
    );
  }

  return img;
}
