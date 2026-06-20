import Link from "next/link";

type LogoVariant = "horizontal" | "vertical";

const ASSETS: Record<
  LogoVariant,
  { src: string; width: number; height: number; defaultClass: string }
> = {
  horizontal: {
    src: "/brand/motiv-iji-logo-horizontal.png",
    width: 1024,
    height: 244,
    defaultClass: "h-9 w-auto max-w-[11rem] sm:h-10 sm:max-w-[12.5rem]",
  },
  vertical: {
    src: "/brand/motiv-iji-logo-vertical.png",
    width: 715,
    height: 937,
    defaultClass: "h-28 w-auto max-w-[9.5rem] sm:h-32 sm:max-w-[10.5rem]",
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
  const asset = ASSETS[variant];
  const cls = [asset.defaultClass, "object-contain", className].filter(Boolean).join(" ");

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.src}
      alt="Motiv-iji モチベイジ"
      width={asset.width}
      height={asset.height}
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
