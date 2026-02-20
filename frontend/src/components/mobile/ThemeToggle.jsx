/**
 * ThemeToggle - Componente para alternar entre temas
 */

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, THEMES } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Versão simples (toggle)
export const ThemeToggleSimple = ({ className }) => {
  const { toggleTheme, isDark } = useTheme();
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn("rounded-full", className)}
      data-testid="theme-toggle"
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-yellow-400" />
      ) : (
        <Moon className="h-5 w-5 text-blue-600" />
      )}
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
};

// Versão com dropdown (3 opções)
export const ThemeToggle = ({ className }) => {
  const { theme, setTheme, THEMES } = useTheme();
  
  const themeOptions = [
    { value: THEMES.LIGHT, label: 'Claro', icon: Sun },
    { value: THEMES.DARK, label: 'Escuro', icon: Moon },
    { value: THEMES.SYSTEM, label: 'Sistema', icon: Monitor },
  ];
  
  const currentTheme = themeOptions.find(t => t.value === theme);
  const CurrentIcon = currentTheme?.icon || Moon;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("rounded-full", className)}
          data-testid="theme-toggle-dropdown"
        >
          <CurrentIcon className="h-5 w-5" />
          <span className="sr-only">Tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                theme === option.value && "bg-blue-500/20 text-blue-400"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{option.label}</span>
              {theme === option.value && (
                <span className="ml-auto text-blue-400">✓</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
