import { toggleSaveAction } from "@/app/actions";

type SaveButtonProps = {
  articleId: string;
  saved: boolean;
  size?: "sm" | "md";
};

export function SaveButton({ articleId, saved, size = "sm" }: SaveButtonProps) {
  const sizeClass = size === "md" ? "px-5 py-3" : "px-4 py-2";
  const toneClass = saved
    ? "border-accent/40 bg-accent-soft text-accent"
    : "border-line text-foreground hover:border-accent/40 hover:text-accent";

  return (
    <form action={toggleSaveAction}>
      <input type="hidden" name="articleId" value={articleId} />
      <button
        type="submit"
        aria-pressed={saved}
        title={saved ? "Remove from your saved list" : "Save for later"}
        className={`rounded-full border text-sm font-semibold hover:-translate-y-0.5 ${sizeClass} ${toneClass}`}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}
