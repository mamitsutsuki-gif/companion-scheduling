import Link from "next/link";

type LogoVariant = "icon" | "horizontal" | "vertical";

/** 黒背景の PNG を白地 UI 上で自然に見せる */
const ON_WHITE_BLEND = "mix-blend-screen";

const ASSETS: Record<
  LogoVariant,
  { src: string; width: number; height: number; defaultClass: string }
> = {
  icon: {
    src: "/brand/motiv-iji-logo-horizontal.png",
    width: 244,
    height: 244,
    defaultClass: `h-9 w-9 shrink-0 object-cover object-left ${ON_WHITE_BLEND}`,
  },
  horizontal: {
    src: "/brand/motiv-iji-logo-horizontal.png",
    width: 1024,
    height: 244,
    defaultClass: `h-8 w-auto max-w-[10rem] object-contain sm:h-9 sm:max-w-[11rem] ${ON_WHITE_BLEND}`,
  },
  vertical: {
    src: "/brand/motiv-iji-logo-vertical.png",
    width: 715,
    height: 937,
    defaultClass: `h-[4.5rem] w-auto max-w-[5.75rem] object-contain sm:h-20 sm:max-w-[6.25rem] ${ON_WHITE_BLEND}`,
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
      src={asset.src}
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
