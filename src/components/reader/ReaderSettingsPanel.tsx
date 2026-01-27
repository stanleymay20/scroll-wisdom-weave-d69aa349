/**
 * Reader Settings Panel
 * 
 * Provides controls for:
 * - Font size
 * - Reading width (narrow/normal/wide/full)
 * - Reading speed (for TTS and animations)
 * - Font color selection
 * - Reading theme
 * - Guided mode toggle
 * - TTS Auto-continue toggle
 */

import { Palette, Type, AlignJustify, Zap, BookOpen, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettings, fontColorPresets } from "@/contexts/SettingsContext";
import { useLanguage } from "@/contexts/LanguageContext";

// Reading theme presets
export const READING_THEMES = {
  default: { bg: 'bg-scroll-indigo-deep', text: 'text-foreground/90', name: 'Default' },
  sepia: { bg: 'bg-amber-50', text: 'text-amber-900', name: 'Sepia' },
  dark: { bg: 'bg-zinc-950', text: 'text-zinc-100', name: 'Dark' },
  cream: { bg: 'bg-orange-50', text: 'text-stone-800', name: 'Cream' },
  mint: { bg: 'bg-emerald-50', text: 'text-emerald-900', name: 'Mint' },
  night: { bg: 'bg-slate-900', text: 'text-slate-100', name: 'Night Blue' },
} as const;

export type ReadingTheme = keyof typeof READING_THEMES;

interface ReaderSettingsPanelProps {
  fontSize: number;
  setFontSize: (size: number) => void;
  readingTheme: ReadingTheme;
  setReadingTheme: (theme: ReadingTheme) => void;
  guidedModeActive: boolean;
  setGuidedModeActive: (active: boolean) => void;
}

export function ReaderSettingsPanel({
  fontSize,
  setFontSize,
  readingTheme,
  setReadingTheme,
  guidedModeActive,
  setGuidedModeActive,
}: ReaderSettingsPanelProps) {
  const { t } = useLanguage();
  const { settings, updateSettings } = useSettings();

  const currentTheme = READING_THEMES[readingTheme];

  return (
    <div className="space-y-5">
      {/* Font Size */}
      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
          <Type className="h-4 w-4" />
          {t('reader.fontSize')}: {fontSize}px
        </label>
        <input
          type="range"
          min="14"
          max="24"
          value={fontSize}
          onChange={(e) => setFontSize(parseInt(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      {/* Reading Width */}
      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
          <AlignJustify className="h-4 w-4" />
          Reading Width
        </label>
        <div className="grid grid-cols-4 gap-2">
          {(['narrow', 'normal', 'wide', 'full'] as const).map((width) => (
            <button
              key={width}
              onClick={() => updateSettings({ reading_width: width })}
              className={`p-2 rounded-md text-xs font-medium transition-all border ${
                settings.reading_width === width
                  ? 'ring-2 ring-primary ring-offset-1 bg-primary/10 border-primary/30'
                  : 'bg-muted/30 border-border/30 hover:bg-muted/50'
              }`}
            >
              {width.charAt(0).toUpperCase() + width.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Reading Speed */}
      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Reading Speed
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['slow', 'normal', 'fast'] as const).map((speed) => (
            <button
              key={speed}
              onClick={() => updateSettings({ reading_speed: speed })}
              className={`p-2 rounded-md text-xs font-medium transition-all border ${
                settings.reading_speed === speed
                  ? 'ring-2 ring-primary ring-offset-1 bg-primary/10 border-primary/30'
                  : 'bg-muted/30 border-border/30 hover:bg-muted/50'
              }`}
            >
              {speed.charAt(0).toUpperCase() + speed.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Font Color */}
      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
          <Type className="h-4 w-4" />
          Font Color
        </label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(fontColorPresets).map(([key, { label, value }]) => (
            <button
              key={key}
              onClick={() => updateSettings({ font_color: key })}
              className={`p-2 rounded-md text-xs font-medium transition-all border flex items-center justify-center gap-1 ${
                settings.font_color === key
                  ? 'ring-2 ring-primary ring-offset-1 bg-primary/10 border-primary/30'
                  : 'bg-muted/30 border-border/30 hover:bg-muted/50'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full border border-border/50"
                style={{ backgroundColor: value === 'inherit' ? 'currentColor' : value }}
              />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Reading Theme Selection */}
      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
          <Palette className="h-4 w-4" />
          {t('reader.readingTheme')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(READING_THEMES) as ReadingTheme[]).map((theme) => (
            <button
              key={theme}
              onClick={() => setReadingTheme(theme)}
              className={`p-2 rounded-md text-xs font-medium transition-all ${
                readingTheme === theme
                  ? 'ring-2 ring-primary ring-offset-1'
                  : 'hover:opacity-80'
              } ${READING_THEMES[theme].bg} ${READING_THEMES[theme].text}`}
            >
              {READING_THEMES[theme].name}
            </button>
          ))}
        </div>
      </div>

      {/* Guided Mode Toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          {t('reader.guidedMode')}
        </span>
        <Button
          variant={guidedModeActive ? "default" : "outline"}
          size="sm"
          onClick={() => setGuidedModeActive(!guidedModeActive)}
        >
          {guidedModeActive ? t('reader.on') : t('reader.off')}
        </Button>
      </div>

      {/* TTS Auto-Continue Toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          Audio Auto-Continue
        </span>
        <Switch
          checked={settings.tts_auto_continue}
          onCheckedChange={(checked) => updateSettings({ tts_auto_continue: checked })}
        />
      </div>
      <p className="text-xs text-muted-foreground/70 -mt-3">
        Automatically play next chapter when audio finishes
      </p>
    </div>
  );
}