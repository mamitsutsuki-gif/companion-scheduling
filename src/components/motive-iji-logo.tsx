import Link from "next/link";

type LogoVariant = "icon" | "horizontal";

const HORIZONTAL = {
  src: "/brand/motiv-iji-logo-horizontal.png",
  width: 1024,
  height: 244,
};

const ASSETS: Record<LogoVariant, { width: number; height: number; defaultClass: string }> = {
  icon: {
    width: 244,
    height: 244,
    defaultClass: "h-9 w-9 shrink-0 object-cover object-left",
  },
  horizontal: {
    width: HORIZONTAL.width,
    height: HORIZONTAL.height,
    defaultClass: "h-7 w-auto max-w-[9.5rem] object-contain sm:h-8 sm:max-w-[10.5rem]",
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
  const cls = [asset.defaultClass, className].filter(Boolean).join(" ");

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={HORIZONTAL.src}
      alt=""
      aria-hidden
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
