import { styledTextRuns, textStyleProps, type PostTextStyle, type TextStyleRange } from '../../lib/postTextStyle';
import { EmojiText } from './EmojiText';

type Props = {
  text: string;
  /** Estilo base del texto (se aplica a lo que no esté dentro de un fragmento). */
  textStyle?: PostTextStyle | null;
  textStyleRanges?: TextStyleRange[] | null;
  className?: string;
  size?: number;
  fitInput?: boolean;
  interactive?: boolean;
};

/**
 * `EmojiText` con estilo por fragmento ("Aa" sobre una selección). Sin fragmentos devuelve
 * el mismo `EmojiText` de siempre y el estilo base lo pone el contenedor (`textStyleProps`).
 */
export function StyledText({ text, textStyle, textStyleRanges, className, size, fitInput, interactive }: Props) {
  const runs = styledTextRuns(text, textStyle, textStyleRanges);
  if (!runs) {
    return <EmojiText text={text} className={className} size={size} fitInput={fitInput} interactive={interactive} />;
  }
  return (
    <span className="lb-ts-runs">
      {runs.map((run, index) => {
        const styled = textStyleProps(run.style);
        return (
          <span key={index} className={styled.className || undefined} style={styled.style}>
            <EmojiText text={run.text} className={className} size={size} fitInput={fitInput} interactive={interactive} />
          </span>
        );
      })}
    </span>
  );
}
