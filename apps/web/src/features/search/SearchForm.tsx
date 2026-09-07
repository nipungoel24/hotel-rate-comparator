import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Search, X } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nextDayIso, utcToday, validateSearchFields } from './validation';
import type { FieldErrors } from './validation';
import type { SearchRequest } from '@hotel/contracts';

interface SearchFormProps {
  searching: boolean;
  onSubmit: (request: SearchRequest) => void;
  onCancel: () => void;
  today?: () => string;
}

interface FieldProps {
  id: string;
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SearchForm({
  searching,
  onSubmit,
  onCancel,
  today = utcToday,
}: SearchFormProps) {
  const [city, setCity] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const cityRef = useRef<HTMLInputElement>(null);
  const checkInRef = useRef<HTMLInputElement>(null);
  const checkOutRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const todayValue = today();
  const checkOutMin =
    checkIn.length > 0 && !errors.checkIn ? nextDayIso(checkIn) : undefined;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (searching) return; // cancel is the only action while searching
    const result = validateSearchFields(city, checkIn, checkOut, today());
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.city) cityRef.current?.focus();
      else if (result.errors.checkIn) checkInRef.current?.focus();
      else if (result.errors.checkOut) checkOutRef.current?.focus();
      return;
    }
    setErrors({});
    onSubmit(result.request);
  };

  // One stable action button for both states: the icon morphs Search -> X and
  // the label changes, but the button itself never swaps type mid-interaction,
  // so a cancel click can never turn into an accidental form submission.
  const handleAction = (): void => {
    if (searching) onCancel();
    else formRef.current?.requestSubmit();
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 md:flex-row md:items-start md:gap-3"
    >
      <div className="flex-1 md:max-w-80">
        <Field id="city" label="City" error={errors.city}>
          <Input
            ref={cityRef}
            id="city"
            name="city"
            type="text"
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              if (errors.city)
                setErrors((current) => ({ ...current, city: undefined }));
            }}
            placeholder="e.g. Sydney"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={errors.city !== undefined}
            aria-describedby={
              errors.city !== undefined ? 'city-error' : undefined
            }
          />
        </Field>
      </div>
      <div className="flex-1 md:max-w-56">
        <Field id="checkIn" label="Check-in" error={errors.checkIn}>
          <Input
            ref={checkInRef}
            id="checkIn"
            name="checkIn"
            type="date"
            min={todayValue}
            value={checkIn}
            onChange={(event) => {
              setCheckIn(event.target.value);
              if (errors.checkIn)
                setErrors((current) => ({ ...current, checkIn: undefined }));
            }}
            aria-invalid={errors.checkIn !== undefined}
            aria-describedby={
              errors.checkIn !== undefined ? 'checkIn-error' : undefined
            }
          />
        </Field>
      </div>
      <div className="flex-1 md:max-w-56">
        <Field id="checkOut" label="Check-out" error={errors.checkOut}>
          <Input
            ref={checkOutRef}
            id="checkOut"
            name="checkOut"
            type="date"
            min={checkOutMin ?? todayValue}
            value={checkOut}
            onChange={(event) => {
              setCheckOut(event.target.value);
              if (errors.checkOut)
                setErrors((current) => ({ ...current, checkOut: undefined }));
            }}
            aria-invalid={errors.checkOut !== undefined}
            aria-describedby={
              errors.checkOut !== undefined ? 'checkOut-error' : undefined
            }
          />
        </Field>
      </div>
      <div className="flex items-end md:pt-0.5">
        <Button
          type="button"
          variant={searching ? 'outline' : 'default'}
          className="w-full md:w-auto"
          onClick={handleAction}
        >
          <MorphIcon
            icon={searching ? X : Search}
            size={16}
            strokeWidth={2.5}
            reducedMotion="user"
            className="transition-none"
          />
          {searching ? 'Cancel search' : 'Search rates'}
        </Button>
      </div>
    </form>
  );
}
