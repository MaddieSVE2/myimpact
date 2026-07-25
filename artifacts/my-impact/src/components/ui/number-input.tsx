import { forwardRef, useEffect, useState } from "react";

/**
 * Strip leading zeros from a numeric string while typing, keeping
 * "0" itself and decimals like "0.5" valid. "0100" -> "100", "00.5" -> "0.5".
 */
export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^(-?)0+(?=\d)/, "$1");
}

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
>;

export interface NumberInputProps extends NativeInputProps {
  /** Current value, a number or numeric string (may be ""). */
  value: number | string;
  /** Fired with the change event after the text has been normalised. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A controlled `<input type="number">` that keeps its own text state so the
 * displayed text is normalised while typing:
 * - leading zeros are stripped ("0100" becomes "100")
 * - clearing the field is allowed even when the parent state holds 0
 * - "0" and decimals like "0.5" remain valid
 *
 * The parent keeps its existing numeric (or string) state and onChange
 * parsing; this component only fixes what is displayed.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ value, onChange, ...rest }, ref) {
    const [text, setText] = useState<string>(() =>
      value === undefined || value === null ? "" : String(value),
    );

    // Sync from the parent when its value changes externally (prefill,
    // reset, switching items). Skip the sync when the parent value is just
    // the parsed echo of what the user is typing, so partial input like
    // "" or "0." isn't stomped.
    useEffect(() => {
      const ext = value === undefined || value === null ? "" : String(value);
      if (ext === text) return;
      const extNum = ext === "" ? NaN : Number(ext);
      const textNum = text === "" ? NaN : Number(text);
      if (Number.isFinite(extNum) && Number.isFinite(textNum) && extNum === textNum) return;
      // Parent parses empty input to 0 (e.g. `Number(v) || 0`); keep the
      // field visually empty while the user is editing.
      if (text === "" && (extNum === 0 || Number.isNaN(extNum))) return;
      // Partial decimal like "0." or "1." parses to the same integer.
      if (text.endsWith(".") && Number(text.slice(0, -1)) === extNum) return;
      setText(ext);
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleaned = stripLeadingZeros(e.target.value);
      if (cleaned !== e.target.value) {
        e.target.value = cleaned;
      }
      setText(cleaned);
      onChange(e);
    };

    return <input ref={ref} type="number" {...rest} value={text} onChange={handleChange} />;
  },
);
