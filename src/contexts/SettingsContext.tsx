import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UserSettings {
  theme_preference: string;
  font_size: string;
  reader_theme: string;
  tts_enabled: boolean;
  animations_enabled: boolean;
  email_updates: boolean;
  new_book_alerts: boolean;
  course_reminders: boolean;
  writing_tone: string;
  spiritual_strictness: string;
  complexity_level: string;
  study_speed: string;
  ai_voice_preference: string;
  // Reader-specific settings
  reading_width: 'narrow' | 'normal' | 'wide' | 'full';
  reading_speed: 'slow' | 'normal' | 'fast';
  font_color: string;
  // TTS Auto-continue between chapters
  tts_auto_continue: boolean;
  // TTS Playback speed multiplier
  tts_playback_speed: number;
}

const defaultSettings: UserSettings = {
  theme_preference: 'light',
  font_size: 'medium',
  reader_theme: 'default',
  tts_enabled: true,
  animations_enabled: true,
  email_updates: true,
  new_book_alerts: true,
  course_reminders: true,
  writing_tone: 'scholarly',
  spiritual_strictness: 'balanced',
  complexity_level: 'intermediate',
  study_speed: 'normal',
  ai_voice_preference: 'natural',
  reading_width: 'normal',
  reading_speed: 'normal',
  font_color: 'default',
  tts_auto_continue: true,
  tts_playback_speed: 1.0,
};

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Font size CSS variable mapping
const fontSizeMap: Record<string, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
  xlarge: '20px',
};

// Reading width CSS variable mapping
const readingWidthMap: Record<string, string> = {
  narrow: '38rem',
  normal: '48rem',
  wide: '64rem',
  full: '100%',
};

// Font color presets (HSL)
export const fontColorPresets: Record<string, { label: string; value: string }> = {
  default: { label: 'Default', value: 'inherit' },
  warm: { label: 'Warm', value: 'hsl(35, 85%, 90%)' },
  cool: { label: 'Cool', value: 'hsl(210, 80%, 90%)' },
  sepia: { label: 'Sepia', value: 'hsl(30, 50%, 75%)' },
  green: { label: 'Green', value: 'hsl(150, 60%, 85%)' },
  amber: { label: 'Amber', value: 'hsl(45, 90%, 85%)' },
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Apply visual settings to document
  const applyVisualSettings = (currentSettings: UserSettings) => {
    const root = document.documentElement;
    
    // Apply theme mode (light / dark / system)
    const themeMode = currentSettings.theme_preference;
    const colorTheme = localStorage.getItem('color-theme') || 'gold';
    
    // Determine effective mode
    let effectiveMode: 'light' | 'dark' = 'light';
    if (themeMode === 'system') {
      effectiveMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else if (themeMode === 'dark') {
      effectiveMode = 'dark';
    } else {
      effectiveMode = 'light';
    }
    
    if (effectiveMode === 'light') {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.add('dark');
      root.setAttribute('data-theme', colorTheme);
    }
    localStorage.setItem('theme-mode', themeMode);
    
    // Apply font size
    const fontSize = fontSizeMap[currentSettings.font_size] || '16px';
    root.style.setProperty('--base-font-size', fontSize);
    root.style.fontSize = fontSize;
    
    // Apply reading width
    const readingWidth = readingWidthMap[currentSettings.reading_width] || '48rem';
    root.style.setProperty('--reading-width', readingWidth);
    
    // Apply font color
    const fontColor = fontColorPresets[currentSettings.font_color]?.value || 'inherit';
    root.style.setProperty('--reader-font-color', fontColor);
    
    // Apply animations preference
    if (!currentSettings.animations_enabled) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  };

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (settings.theme_preference === 'system') {
        applyVisualSettings(settings);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings]);

  // Fetch settings on mount and when user changes
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUserId(user.id);
          const { data } = await supabase
            .from('profiles')
            .select('theme_preference, font_size, reader_theme, tts_enabled, animations_enabled, email_updates, new_book_alerts, course_reminders, writing_tone, spiritual_strictness, complexity_level, study_speed, ai_voice_preference, learning_preferences')
            .or(`user_id.eq.${user.id},id.eq.${user.id}`)
            .maybeSingle();
          
          if (data) {
            // Extract reader settings from learning_preferences JSON
            const learningPrefs = (data.learning_preferences as Record<string, unknown>) || {};
            
            const userSettings: UserSettings = {
              theme_preference: data.theme_preference || defaultSettings.theme_preference,
              font_size: data.font_size || defaultSettings.font_size,
              reader_theme: data.reader_theme || defaultSettings.reader_theme,
              tts_enabled: data.tts_enabled ?? defaultSettings.tts_enabled,
              animations_enabled: data.animations_enabled ?? defaultSettings.animations_enabled,
              email_updates: data.email_updates ?? defaultSettings.email_updates,
              new_book_alerts: data.new_book_alerts ?? defaultSettings.new_book_alerts,
              course_reminders: data.course_reminders ?? defaultSettings.course_reminders,
              writing_tone: data.writing_tone || defaultSettings.writing_tone,
              spiritual_strictness: data.spiritual_strictness || defaultSettings.spiritual_strictness,
              complexity_level: data.complexity_level || defaultSettings.complexity_level,
              study_speed: data.study_speed || defaultSettings.study_speed,
              ai_voice_preference: data.ai_voice_preference || defaultSettings.ai_voice_preference,
              // Extract new settings from learning_preferences
              reading_width: (learningPrefs.reading_width as UserSettings['reading_width']) || defaultSettings.reading_width,
              reading_speed: (learningPrefs.reading_speed as UserSettings['reading_speed']) || defaultSettings.reading_speed,
              font_color: (learningPrefs.font_color as string) || defaultSettings.font_color,
              tts_auto_continue: (learningPrefs.tts_auto_continue as boolean) ?? defaultSettings.tts_auto_continue,
              tts_playback_speed: (learningPrefs.tts_playback_speed as number) ?? defaultSettings.tts_playback_speed,
            };
            setSettings(userSettings);
            applyVisualSettings(userSettings);
          }
        } else {
          // Apply default/localStorage settings for non-logged-in users
          const themeMode = localStorage.getItem('theme-mode') || 'dark';
          const readingWidth = localStorage.getItem('reading-width') || 'normal';
          const fontColor = localStorage.getItem('font-color') || 'default';
          const settingsWithLocalStorage = { 
            ...defaultSettings, 
            theme_preference: themeMode,
            reading_width: readingWidth as UserSettings['reading_width'],
            font_color: fontColor,
          };
          setSettings(settingsWithLocalStorage);
          applyVisualSettings(settingsWithLocalStorage);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        applyVisualSettings(defaultSettings);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUserId(session.user.id);
        fetchSettings();
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
        setSettings(defaultSettings);
        applyVisualSettings(defaultSettings);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    applyVisualSettings(newSettings);

    // Save to localStorage for guest users
    if (updates.reading_width) localStorage.setItem('reading-width', updates.reading_width);
    if (updates.font_color) localStorage.setItem('font-color', updates.font_color);

    // Save to database if logged in
    if (userId) {
      try {
        // Separate standard fields from learning_preferences fields
        const { reading_width, reading_speed, font_color, tts_auto_continue, tts_playback_speed, ...standardUpdates } = updates;
        
        // If there are new reader settings, update learning_preferences
        if (reading_width || reading_speed || font_color || tts_auto_continue !== undefined || tts_playback_speed !== undefined) {
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('learning_preferences')
            .or(`user_id.eq.${userId},id.eq.${userId}`)
            .single();
          
          const currentPrefs = (currentProfile?.learning_preferences as Record<string, unknown>) || {};
          
          await supabase
            .from('profiles')
            .update({
              ...standardUpdates,
              learning_preferences: {
                ...currentPrefs,
                ...(reading_width && { reading_width }),
                ...(reading_speed && { reading_speed }),
                ...(font_color && { font_color }),
                ...(tts_auto_continue !== undefined && { tts_auto_continue }),
                ...(tts_playback_speed !== undefined && { tts_playback_speed }),
              },
              updated_at: new Date().toISOString(),
            })
            .or(`user_id.eq.${userId},id.eq.${userId}`);
        } else {
          await supabase
            .from('profiles')
            .update({
              ...standardUpdates,
              updated_at: new Date().toISOString(),
            })
            .or(`user_id.eq.${userId},id.eq.${userId}`);
        }
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}