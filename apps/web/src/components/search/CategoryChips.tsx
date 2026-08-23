import { LIVE_CATEGORIES } from '../../lib/categories';

type Props = {
  value: string;
  onChange: (category: string) => void;
};

export function CategoryChips({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
          !value
            ? 'bg-boom-cyan/15 text-boom-cyan ring-boom-cyan/40'
            : 'text-zinc-400 ring-white/10 hover:text-white'
        }`}
      >
        Todas
      </button>
      {LIVE_CATEGORIES.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id === value ? '' : item.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
            value === item.id
              ? 'bg-boom-cyan/15 text-boom-cyan ring-boom-cyan/40'
              : 'text-zinc-400 ring-white/10 hover:text-white'
          }`}
        >
          {item.emoji} {item.label}
        </button>
      ))}
    </div>
  );
}
