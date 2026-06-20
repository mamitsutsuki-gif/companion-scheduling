import Link from "next/link";

type LogoVariant = "icon" | "horizontal";

const LOGOS: Record<
  LogoVariant,
  { src: string; width: number; height: number; className: string }
> = {
  icon: {
    src: "/brand/motiv-iji-logo-icon.png",
    width: 244,
    height: 244,
    className: "block h-9 w-9 shrink-0 object-contain",
  },
  horizontal: {
    src: "/brand/motiv-iji-logo-horizontal.png",
    width: 1024,
    height: 244,
    className: "block h-10 w-auto max-w-[14rem] object-contain sm:h-11 sm:max-w-[15rem]",
  },
};

/**
 * App Hosting では `next/image` の最適化 URL が 404 になるため、
 * public 配下の PNG を `<img>` で直接参照する。
 */
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
  const logo = LOGOS[variant];
  const cls = [logo.className, className].filter(Boolean).join(" ");

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo.src}
      alt={variant === "horizontal" ? "Motiv-iji モチベイジ" : ""}
      aria-hidden={variant === "icon" ? true : undefined}
      width={logo.width}
      height={logo.height}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cls}
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
