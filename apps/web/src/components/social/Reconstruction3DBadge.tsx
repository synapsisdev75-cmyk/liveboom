type Props = {
  className?: string;
  compact?: boolean;
};

export function Reconstruction3DBadge({ className = '', compact = false }: Props) {
  return (
    <span className={`lb-recon3d-badge ${compact ? 'lb-recon3d-badge--compact' : ''} ${className}`.trim()}>
      <span aria-hidden>◇</span>
      <span>3D</span>
    </span>
  );
}
