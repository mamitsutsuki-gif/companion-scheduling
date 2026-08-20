export const CSA_STAR_REGISTRY_HREF =
  "https://cloudsecurityalliance.org/star/registry/motivage-company-limited";

const ALT = "CSA STAR Level 1 Self-Assessment（Cloud Security Alliance STAR Registry）";

/**
 * CSA STAR Level 1 公式バッジ。
 * 許可済みアセットを改変せず表示し、Registry へリンクする。
 */
export function CsaStarMark({
  size = "md",
}: {
  size?: "xs" | "sm" | "md";
}) {
  const src =
    size === "md"
      ? "/branding/csa-star-level-1-badge-large.png"
      : "/branding/csa-star-level-1-badge-small.png";
  return (
    <a
      href={CSA_STAR_REGISTRY_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex no-underline"
      title="CSA STAR Registry で登録内容を確認する"
    >
      <img
        src={src}
        alt={ALT}
        className={
          size === "md" ? "h-28 w-auto sm:h-32" : size === "sm" ? "h-16 w-auto" : "h-11 w-auto"
        }
      />
    </a>
  );
}

/** @deprecated 公式バッジ差し替え後。既存 import 互換のため残す */
export const CsaStarMarkPlaceholder = CsaStarMark;
