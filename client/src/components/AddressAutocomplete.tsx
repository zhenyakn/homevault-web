/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ensureGoogleMaps } from "@/components/Map";
import { cn } from "@/lib/utils";

export interface AddressSelection {
  /** Formatted address as returned by Google. */
  address: string;
  /** Stringified decimals — match the `decimal` columns in the DB. */
  latitude: string;
  longitude: string;
}

interface AddressAutocompleteProps {
  value: string;
  /** Fires on every keystroke (free typing is always allowed). */
  onChange: (text: string) => void;
  /** Fires when the user picks a suggestion; carries the geocoded coords. */
  onSelect: (selection: AddressSelection) => void;
  /** Fires when the field loses focus, with the current text. */
  onBlur?: (text: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  id?: string;
}

type Prediction = google.maps.places.AutocompletePrediction;

/**
 * Address field backed by Google Places. As the user types it shows live
 * suggestions; picking one fills the input with the formatted address and
 * geocodes it to latitude/longitude via `onSelect`.
 *
 * The suggestion list is rendered inside the React tree (not Google's own
 * `.pac-container`) so it behaves correctly inside dialogs/modals and matches
 * the app's design tokens. If Google Maps can't load, it degrades gracefully
 * to a plain text input.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  placeholder,
  className,
  inputClassName,
  autoFocus,
  id,
}: AddressAutocompleteProps) {
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(
    null
  );
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const tokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    ensureGoogleMaps().then(google => {
      if (cancelled || !google?.maps?.places) return;
      serviceRef.current = new google.maps.places.AutocompleteService();
      geocoderRef.current = new google.maps.Geocoder();
      tokenRef.current = new google.maps.places.AutocompleteSessionToken();
    });
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
    };
  }, []);

  function queryPredictions(input: string) {
    const service = serviceRef.current;
    if (!service || input.trim().length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    service.getPlacePredictions(
      { input, sessionToken: tokenRef.current ?? undefined },
      results => {
        setLoading(false);
        setPredictions(results ?? []);
        setActiveIdx(-1);
        setOpen((results?.length ?? 0) > 0);
      }
    );
  }

  function handleInput(text: string) {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => queryPredictions(text), 250);
  }

  function pick(prediction: Prediction) {
    setOpen(false);
    setPredictions([]);
    onChange(prediction.description);
    const geocoder = geocoderRef.current;
    if (!geocoder) return;
    geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const loc = results[0].geometry.location;
        onSelect({
          address: results[0].formatted_address ?? prediction.description,
          latitude: loc.lat().toString(),
          longitude: loc.lng().toString(),
        });
      }
      // A session token is consumed once a place is selected; start a new one.
      const google = window.google;
      if (google?.maps?.places) {
        tokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(predictions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(predictions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          className={cn("pr-8", inputClassName)}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          onBlur={e => {
            const text = e.target.value;
            // Delay so a click on a suggestion registers before we close.
            blurRef.current = setTimeout(() => {
              setOpen(false);
              onBlur?.(text);
            }, 150);
          }}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </span>
      </div>

      {open && predictions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {predictions.map((p, i) => (
            <li key={p.place_id}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the input blur.
                onMouseDown={e => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  i === activeIdx
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60"
                )}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {p.structured_formatting?.main_text ?? p.description}
                  </span>
                  {p.structured_formatting?.secondary_text && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.structured_formatting.secondary_text}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
