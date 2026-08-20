export const SECURITY_ACTION_HREF = "https://www.ipa.go.jp/security/security-action/";

const ALT = "SECURITY ACTION 二つ星（IPA セキュリティ対策自己宣言）";

export function SecurityActionMark({
  size = "sm",
}: {
  size?: "xs" | "sm" | "md";
}) {
  const src =
    size === "md"
      ? "/branding/security-action-futatsuboshi-large.png"
      : "/branding/security-action-futatsuboshi-small.png";
  return (
    <a
      href={SECURITY_ACTION_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex no-underline"
      title="IPA SECURITY ACTION（二つ星）の説明を開く"
    >
      {/* 公式マークは改変せずそのまま表示する */}
      <img
        src={src}
        alt={ALT}
        className={size === "md" ? "h-28 w-auto sm:h-32" : size === "sm" ? "h-16 w-auto" : "h-11 w-auto"}
      />
    </a>
  );
}
