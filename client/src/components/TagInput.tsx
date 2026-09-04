import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

/** Editable list of short labels. Enter or comma commits, Backspace removes. */
export function TagInput({ value, onChange, placeholder = "Add a tag…" }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[#c9d3c3] bg-white/50 p-2 min-h-[40px] focus-within:ring-1 focus-within:ring-[#D85A3E]">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-[#ecf3e9] px-2 py-0.5 text-xs text-[#597c62]"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            className="opacity-60 hover:opacity-100"
            onClick={() => onChange(value.filter((entry) => entry !== tag))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-[#7a8c7b]"
      />
    </div>
  );
}
