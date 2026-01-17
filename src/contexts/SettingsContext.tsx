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
}

const defaultSettings: UserSettings = {
  theme_preference: 'dark',
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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Apply visual settings to document
  const applyVisualSettings = (currentSettings: UserSettings) => {
    const root = document.documentElement;
    
    // Apply theme mode
    const themeMode = currentSettings.theme_preference;
    const colorTheme = localStorage.getItem('color-theme') || 'gold';
    
    if (themeMode === 'light') {
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
    
    // Apply animations preference
    if (!currentSettings.animations_enabled) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  };

  // Fetch settings on mount and when user changes
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUserId(user.id);
          const { data } = await supabase
            .from('profiles')
            .select('theme_preference, font_size, reader_theme, tts_enabled, animations_enabled, email_updates, new_book_alerts, course_reminders, writing_tone, spiritual_strictness, complexity_level, study_speed, ai_voice_preference')
            .eq('id', user.id)
            .maybeSingle();
          
          if (data) {
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
            };
            setSettings(userSettings);
            applyVisualSettings(userSettings);
          }
        } else {
          // Apply default/localStorage settings for non-logged-in users
          const themeMode = localStorage.getItem('theme-mode') || 'dark';
          const settingsWithLocalStorage = { ...defaultSettings, theme_preference: themeMode };
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

    // Save to database if logged in
    if (userId) {
      try {
        await supabase
          .from('profiles')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
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
