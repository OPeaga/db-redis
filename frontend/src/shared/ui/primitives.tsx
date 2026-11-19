import React, { useId } from 'react';
import clsx from 'clsx';

/**
 * Tokens visuais e componentes base do Design System centralizados.
 * Paleta DistriCommerce: #000000 (Black), #14213D (Oxford Navy), #FCA311 (Amber), #E5E5E5 (Platinum), #FFFFFF (White)
 */
export const designTokens = {
  layout: {
    container: 'max-w-7xl mx-auto px-4',
    productGrid: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5',
  },
  header: {
    bar: 'bg-brand-navy text-white shadow-sm',
    searchBox:
      'w-full bg-bg-surface rounded-md px-4 py-2 text-sm text-brand-black placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-amber',
    navLink:
      'text-xs sm:text-sm text-white/80 hover:text-brand-amber transition-colors cursor-pointer font-normal',
    navLinkActive: 'text-brand-amber font-semibold',
  },
  surface: {
    card: 'bg-bg-surface rounded-lg shadow-xs border border-border-subtle',
    productCard:
      'group bg-bg-surface rounded-lg shadow-xs border border-border-subtle hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col',
  },
  badgeVariants: {
    neutral: 'bg-bg-muted text-ink-secondary',
    amber: 'bg-brand-amber-soft text-brand-navy border border-brand-amber/40',
    navy: 'bg-brand-navy text-white',
    success: 'bg-success-bg text-success-text',
    danger: 'bg-danger-bg text-danger-text',
    info: 'bg-info-bg text-info-text',
  },
  buttonVariants: {
    primary: 'bg-brand-navy text-white hover:bg-brand-black border-transparent',
    accent:
      'bg-brand-amber text-brand-black font-semibold hover:bg-brand-amber-hover border-transparent',
    secondary: 'bg-bg-surface text-brand-navy hover:bg-bg-muted border-border-strong',
    danger: 'bg-danger-bg text-danger-text hover:bg-red-200 border-transparent',
    ghost: 'bg-transparent text-ink-secondary hover:bg-black/5 border-transparent',
  },
} as const;

export type BadgeVariant = keyof typeof designTokens.badgeVariants;
export type ButtonVariant = keyof typeof designTokens.buttonVariants;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    className={clsx(
      'inline-flex items-center justify-center gap-1.5 font-medium rounded-md border transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber',
      size === 'sm' && 'px-3 py-1.5 text-xs',
      size === 'md' && 'px-4 py-2 text-sm',
      size === 'lg' && 'px-5 py-3 text-base',
      designTokens.buttonVariants[variant],
      className
    )}
    {...props}
  >
    {children}
  </button>
);

export const Badge: React.FC<{
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}> = ({ variant = 'neutral', children, className }) => (
  <span
    className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-semibold whitespace-nowrap',
      designTokens.badgeVariants[variant],
      className
    )}
  >
    {children}
  </span>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={clsx(designTokens.surface.card, 'p-5', className)}>{children}</div>;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className, id, ...props }) => {
  const autoId = useId();
  const inputId =
    id ?? (label ? `campo-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${autoId}` : autoId);

  return (
    <label htmlFor={inputId} className="block space-y-1">
      {label && <span className="block text-xs font-medium text-ink-secondary">{label}</span>}
      <input
        id={inputId}
        className={clsx(
          'w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-amber/60',
          className
        )}
        {...props}
      />
    </label>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select: React.FC<SelectProps> = ({ label, className, id, children, ...props }) => {
  const autoId = useId();
  const selectId =
    id ?? (label ? `campo-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${autoId}` : autoId);

  return (
    <label htmlFor={selectId} className="block space-y-1">
      {label && <span className="block text-xs font-medium text-ink-secondary">{label}</span>}
      <select
        id={selectId}
        className={clsx(
          'w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-amber/60',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
};

export const PriceTag: React.FC<{
  value: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ value, size = 'lg', className }) => {
  const [inteiro, centavos] = value.toFixed(2).split('.');
  const inteiroFormatado = Number(inteiro).toLocaleString('pt-BR');

  return (
    <span
      className={clsx(
        'inline-flex items-start font-semibold text-brand-black leading-none tabular-nums',
        className
      )}
    >
      <span
        className={clsx(
          size === 'lg' && 'text-2xl',
          size === 'md' && 'text-lg',
          size === 'sm' && 'text-sm'
        )}
      >
        R$ {inteiroFormatado}
      </span>
      <span
        className={clsx(
          'ml-0.5 font-semibold',
          size === 'lg' && 'text-xs mt-0.5',
          size === 'md' && 'text-[11px] mt-0.5',
          size === 'sm' && 'text-[10px]'
        )}
      >
        {centavos}
      </span>
    </span>
  );
};

export const QuantityStepper: React.FC<{
  value: number;
  max?: number;
  nomeItem: string;
  disabled?: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}> = ({ value, max, nomeItem, disabled = false, onDecrement, onIncrement }) => (
  <div className="inline-flex items-center border border-border-strong rounded-md bg-bg-surface h-9">
    <button
      type="button"
      aria-label={`Diminuir quantidade de ${nomeItem}`}
      disabled={disabled}
      onClick={onDecrement}
      className="w-8 h-full text-brand-navy font-semibold hover:bg-bg-muted disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer rounded-l-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-amber"
    >
      −
    </button>
    <span className="w-9 text-center text-sm font-medium select-none tabular-nums">{value}</span>
    <button
      type="button"
      aria-label={`Aumentar quantidade de ${nomeItem}`}
      disabled={disabled || (max !== undefined && value >= max)}
      onClick={onIncrement}
      className="w-8 h-full text-brand-navy font-semibold hover:bg-bg-muted disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer rounded-r-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-amber"
    >
      +
    </button>
  </div>
);
