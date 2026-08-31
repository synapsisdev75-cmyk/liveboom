import { LIVE_CATEGORIES } from '../../lib/categories';

type Props = {
  value: string;
  onChange: (category: string) => void;
};

export function CategoryChips({ value, onChange }: Props) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
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
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
            value === item.id
              ? 'bg-boom-cyan/15 text-boom-cyan ring-boom-cyan/40'
              : 'text-zinc-400 ring-white/10 hover:text-white'
          }`}
        >
          <img
            src={item.icon}
            alt=""
            className="h-5 w-5 object-contain [mix-blend-mode:screen]"
            draggable={false}
          />
          {item.label}
        </button>
      ))}
    </div>
  );
}
