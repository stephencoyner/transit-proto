'use client';

import React from 'react';
import CloseFiltersIcon from '@/components/Icons/Close-Filters.svg';
import OpenFiltersIcon from '@/components/Icons/Open-Filters.svg';

interface NavRailProps {
  activeTab: 'system' | 'routes' | 'stops';
  onTabChange: (tab: 'system' | 'routes' | 'stops') => void;
  userInitial?: string;
  isFiltersPanelOpen: boolean;
  onToggleFiltersPanel: () => void;
}

const NavRail: React.FC<NavRailProps> = ({
  activeTab,
  onTabChange,
  userInitial = 'S',
  isFiltersPanelOpen,
  onToggleFiltersPanel
}) => {
  const navItems = [
    { id: 'system' as const, label: 'System', icon: '/icons/system.svg' },
    { id: 'routes' as const, label: 'Routes', icon: '/icons/routes.svg' },
    { id: 'stops' as const, label: 'Stops', icon: '/icons/stops.svg' },
  ];

  return (
    <div className="flex flex-col items-center bg-bg-primary border-r border-border-default h-full px-2" style={{ paddingTop: '24px', paddingBottom: '24px' }}>
      {/* Toggle Filters Button */}
      <button
        onClick={onToggleFiltersPanel}
        className="flex items-center justify-center w-10 h-10 rounded-default transition-colors hover:bg-btn-secondary/50 mb-6"
        aria-label="Toggle filters panel"
        aria-expanded={isFiltersPanelOpen}
        aria-controls="filters-panel"
      >
        <img
          src={isFiltersPanelOpen ? CloseFiltersIcon.src : OpenFiltersIcon.src}
          alt=""
          className="w-4 h-4"
          aria-hidden="true"
        />
      </button>

      {/* Navigation Items */}
      <nav className="flex flex-col gap-2 w-full flex-1" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`
                flex flex-col items-center justify-center gap-1 py-3 px-2
                rounded-default transition-colors
                ${isActive
                  ? 'bg-btn-secondary'
                  : 'bg-transparent hover:bg-btn-secondary/50'
                }
              `}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <img
                src={item.icon}
                alt=""
                className="w-5 h-5"
                aria-hidden="true"
              />
              <span className="nav-label text-text-tertiary">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* User Profile - At Bottom */}
      <div
        className="flex items-center justify-center w-14 h-14 rounded-full border border-border-default bg-bg-elevated"
        style={{ marginBottom: '0' }}
        aria-label="User profile"
      >
        <span className="body-large text-text-secondary">
          {userInitial}
        </span>
      </div>
    </div>
  );
};

export default NavRail;
