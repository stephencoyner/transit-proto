'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface NavRailProps {
  activeTab: 'system' | 'routes' | 'stops' | 'components';
  onTabChange: (tab: 'system' | 'routes' | 'stops' | 'components') => void;
  userInitial?: string;
  isFiltersPanelOpen: boolean;
  onToggleFiltersPanel: () => void;
  routeControlsTitleSemibold: boolean;
  onRouteControlsTitleSemiboldChange: (value: boolean) => void;
  differentiatedPanelBackgrounds: boolean;
  onDifferentiatedPanelBackgroundsChange: (value: boolean) => void;
  allowAbsoluteNumberComparisons: boolean;
  onAllowAbsoluteNumberComparisonsChange: (value: boolean) => void;
  fullScreenBookmarkModal: boolean;
  onFullScreenBookmarkModalChange: (value: boolean) => void;
  onOpenBookmarks: () => void;
  showBookmarkSavedToast?: boolean;
}

// Inline SVG components for nav icons
const SystemIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="16.4852" width="12" height="2" rx="1" transform="rotate(-45 8 16.4852)" fill="currentColor"/>
    <rect y="8.48523" width="12" height="2" rx="1" transform="rotate(-45 0 8.48523)" fill="currentColor"/>
    <rect x="1" y="15.1421" width="20" height="2" rx="1" transform="rotate(-45 1 15.1421)" fill="currentColor"/>
  </svg>
);

const RoutesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.221802" y="14.364" width="20" height="2" rx="1" transform="rotate(-45 0.221802 14.364)" fill="currentColor"/>
  </svg>
);

const StopsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const BookmarksIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.0001 18.2211L7.97337 19.9434C7.21504 20.2625 6.49604 20.1992 5.81637 19.7534C5.13671 19.3077 4.79688 18.677 4.79688 17.8614V5.07163C4.79688 4.44196 5.01863 3.90538 5.46213 3.46188C5.90563 3.01838 6.44221 2.79663 7.07188 2.79663H16.9284C17.558 2.79663 18.0946 3.01838 18.5381 3.46188C18.9816 3.90538 19.2034 4.44196 19.2034 5.07163V17.8614C19.2034 18.677 18.8635 19.3077 18.1839 19.7534C17.5042 20.1992 16.7852 20.2625 16.0269 19.9434L12.0001 18.2211ZM12.0001 15.7281L16.9284 17.8424V5.07163H7.07188V17.8424L12.0001 15.7281ZM12.0001 5.07163H7.07188H16.9284H12.0001Z" fill="currentColor"/>
  </svg>
);

const ExperimentsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.33346 14.1356C2.71102 14.1356 2.26774 13.8569 2.00363 13.2996C1.73941 12.7422 1.80369 12.2256 2.19646 11.7498L5.86463 7.28561V3.42511H5.32146C5.10869 3.42511 4.92913 3.35195 4.7828 3.20561C4.63635 3.05917 4.56313 2.87956 4.56313 2.66678C4.56313 2.454 4.63635 2.27439 4.7828 2.12795C4.92913 1.98161 5.10869 1.90845 5.32146 1.90845H10.6788C10.8916 1.90845 11.0711 1.98161 11.2175 2.12795C11.3639 2.27439 11.4371 2.454 11.4371 2.66678C11.4371 2.87956 11.3639 3.05917 11.2175 3.20561C11.0711 3.35195 10.8916 3.42511 10.6788 3.42511H10.1356V7.28561L13.8038 11.7498C14.1966 12.2256 14.2609 12.7422 13.9966 13.2996C13.7325 13.8569 13.2892 14.1356 12.6668 14.1356H3.33346ZM4.77046 11.9523H11.2298L9.04296 9.38128H6.9573L4.77046 11.9523ZM3.43713 12.6189H12.5631L8.61896 7.82011V3.42511H7.3813V7.82011L3.43713 12.6189Z" fill="currentColor"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.14109 14.8021C6.82776 14.8021 6.55809 14.6988 6.33209 14.4921C6.1062 14.2854 5.97104 14.031 5.92659 13.7289L5.77659 12.6249C5.65337 12.5774 5.53648 12.52 5.42593 12.4528C5.31548 12.3856 5.20709 12.3143 5.10076 12.2388L4.07143 12.6721C3.78309 12.797 3.49337 12.8088 3.20226 12.7074C2.91115 12.6061 2.6852 12.421 2.52443 12.1521L1.66526 10.6459C1.50437 10.3797 1.45793 10.0962 1.52593 9.79542C1.59393 9.49453 1.74993 9.24698 1.99393 9.05275L2.87326 8.38609C2.86481 8.31898 2.86059 8.25464 2.86059 8.19309V7.80675C2.86059 7.7452 2.86481 7.68087 2.87326 7.61375L1.99393 6.95109C1.74726 6.75687 1.59059 6.50931 1.52393 6.20842C1.45726 5.90753 1.50437 5.6227 1.66526 5.35392L2.52443 3.85175C2.6852 3.58553 2.91048 3.40109 3.20026 3.29842C3.49004 3.19575 3.77909 3.20686 4.06743 3.33175L5.10876 3.76509C5.21509 3.68953 5.32426 3.61881 5.43626 3.55292C5.54837 3.48714 5.66181 3.43048 5.77659 3.38292L5.92659 2.27492C5.97104 1.97014 6.1062 1.71442 6.33209 1.50775C6.55809 1.30109 6.82776 1.19775 7.14109 1.19775H8.85909C9.17243 1.19775 9.44209 1.30109 9.66809 1.50775C9.89398 1.71442 10.0291 1.97014 10.0736 2.27492L10.2236 3.38292C10.3468 3.43048 10.4637 3.48714 10.5743 3.55292C10.6847 3.61881 10.7931 3.68953 10.8994 3.76509L11.9288 3.33175C12.2171 3.20686 12.5068 3.19575 12.7979 3.29842C13.089 3.40109 13.315 3.58553 13.4758 3.85175L14.3349 5.35392C14.4958 5.6227 14.5429 5.90753 14.4763 6.20842C14.4096 6.50931 14.2529 6.75687 14.0063 6.95109L13.1229 7.61375C13.1314 7.68087 13.1356 7.7452 13.1356 7.80675V7.99992C13.1356 8.06703 13.1349 8.13142 13.1336 8.19309C13.1323 8.25464 13.1231 8.31898 13.1063 8.38609L13.9896 9.04875C14.2363 9.24298 14.3929 9.49053 14.4596 9.79142C14.5263 10.0923 14.4791 10.3771 14.3183 10.6459L13.4424 12.1521C13.2816 12.4183 13.0564 12.6028 12.7666 12.7054C12.4768 12.8081 12.1878 12.797 11.8994 12.6721L10.8914 12.2388C10.7851 12.3143 10.6759 12.3856 10.5639 12.4528C10.4518 12.52 10.3384 12.5774 10.2236 12.6249L10.0736 13.7289C10.0291 14.031 9.89398 14.2854 9.66809 14.4921C9.44209 14.6988 9.17243 14.8021 8.85909 14.8021H7.14109ZM7.37726 13.2854H8.60226L8.83959 11.5268C9.1867 11.4379 9.51082 11.3066 9.81193 11.1331C10.1129 10.9595 10.3856 10.7452 10.6301 10.4901L12.2763 11.1734L12.8784 10.1119L11.4569 9.03659C11.5125 8.8757 11.5527 8.70781 11.5776 8.53292C11.6025 8.35803 11.6149 8.18037 11.6149 7.99992C11.6149 7.81948 11.6025 7.64181 11.5776 7.46692C11.5527 7.29203 11.5125 7.12414 11.4569 6.96325L12.8863 5.88792L12.2763 4.82642L10.6341 5.52642C10.3896 5.26287 10.1169 5.04298 9.81593 4.86675C9.51482 4.69053 9.18937 4.55931 8.83959 4.47309L8.62293 2.71442H7.38993L7.16459 4.46909C6.81215 4.55531 6.4847 4.68653 6.18226 4.86275C5.87993 5.03898 5.6052 5.25464 5.35809 5.50975L3.72009 4.82642L3.11393 5.88792L4.53126 6.94275C4.4757 7.11464 4.43548 7.28592 4.41059 7.45659C4.3857 7.62725 4.37326 7.80837 4.37326 7.99992C4.37326 8.18037 4.3857 8.35659 4.41059 8.52859C4.43548 8.70059 4.4757 8.87253 4.53126 9.04442L3.11393 10.1119L3.72009 11.1734L5.35809 10.4774C5.6052 10.7383 5.88059 10.9569 6.18426 11.1331C6.48804 11.3093 6.81482 11.4419 7.16459 11.5308L7.37726 13.2854ZM8.02143 10.3333C8.66587 10.3333 9.21587 10.1055 9.67143 9.64992C10.127 9.19437 10.3548 8.64437 10.3548 7.99992C10.3548 7.35548 10.127 6.80548 9.67143 6.34992C9.21587 5.89437 8.66587 5.66659 8.02143 5.66659C7.36854 5.66659 6.81643 5.89437 6.36509 6.34992C5.91376 6.80548 5.68809 7.35548 5.68809 7.99992C5.68809 8.64437 5.91376 9.19437 6.36509 9.64992C6.81643 10.1055 7.36854 10.3333 8.02143 10.3333Z" fill="currentColor"/>
  </svg>
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ComponentsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor"/>
    <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor"/>
    <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor"/>
    <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/>
  </svg>
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OpenPanelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="6.99382e-07" width="16" height="2" rx="1" transform="rotate(90 9 6.99382e-07)" fill="currentColor"/>
    <rect x="15" y="6.99382e-07" width="16" height="2" rx="1" transform="rotate(90 15 6.99382e-07)" fill="currentColor"/>
    <rect x="3" y="6.99382e-07" width="16" height="2" rx="1" transform="rotate(90 3 6.99382e-07)" fill="currentColor"/>
  </svg>
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ClosePanelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="12" y="6.99382e-07" width="16" height="2" rx="1" transform="rotate(90 12 6.99382e-07)" fill="currentColor"/>
    <rect x="6" y="6.99382e-07" width="16" height="2" rx="1" transform="rotate(90 6 6.99382e-07)" fill="currentColor"/>
  </svg>
);

const OpenFiltersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect y="2" width="16" height="2" rx="1" fill="currentColor"/>
    <rect y="7" width="16" height="2" rx="1" fill="currentColor"/>
    <rect y="12" width="16" height="2" rx="1" fill="currentColor"/>
  </svg>
);

const OpenFilters2Icon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.80664 14.7515C3.41808 15.1432 2.79051 15.1417 2.40332 14.7485C2.01538 14.3544 2.01538 13.7159 2.40332 13.3218L7.63184 8.01319L2.44043 2.74073C2.05314 2.34727 2.05314 1.70939 2.44043 1.31593C2.82791 0.922713 3.4563 0.922669 3.84375 1.31593L9.80176 7.36671C10.0237 7.59225 10.1024 7.89924 10.0518 8.19093C10.0496 8.35257 9.98915 8.51515 9.86328 8.6421L3.80664 14.7515Z" fill="currentColor"/>
    <rect x="12" y="15.0001" width="14" height="2" rx="1" transform="rotate(-90 12 15.0001)" fill="currentColor"/>
  </svg>
);

// const CloseFiltersIcon = () => (
//   <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
//     <rect y="2" width="11" height="2" rx="1" fill="currentColor"/>
//     <rect y="7" width="8" height="2" rx="1" fill="currentColor"/>
//     <rect y="12" width="11" height="2" rx="1" fill="currentColor"/>
//     <path d="M9.7296 8.68689C9.33035 8.2659 9.33913 7.6035 9.74939 7.19324L14.2786 2.66404C14.6728 2.26979 15.312 2.26979 15.7063 2.66404C16.0952 3.05298 16.1012 3.68171 15.7197 4.07799L11.2777 8.69265C10.8543 9.1324 10.1496 9.12977 9.7296 8.68689Z" fill="currentColor"/>
//     <path d="M10.2588 7.32618C10.6649 7.10875 11.1655 7.18285 11.4913 7.5086L15.7168 11.7341C16.1098 12.1272 16.1098 12.7644 15.7168 13.1575C15.3273 13.547 14.6972 13.551 14.3027 13.1667L10.0226 8.99642C9.5163 8.50306 9.63551 7.65984 10.2588 7.32618Z" fill="currentColor"/>
//   </svg>
// );

const CloseFilters2Icon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.1231 1.32543C12.5503 0.891944 13.2429 0.891752 13.67 1.32543C14.097 1.75919 14.097 2.46299 13.67 2.89672L8.64658 7.99633L13.6778 13.1047C14.1045 13.5384 14.1045 14.2414 13.6778 14.675C13.2507 15.1088 12.5581 15.1087 12.131 14.675L6.42001 8.87719C6.3857 8.84984 6.35203 8.82043 6.3204 8.78832C6.10691 8.57146 6.0001 8.28736 6.00009 8.00317C5.99644 7.71413 6.10225 7.4239 6.31943 7.20336C6.35442 7.16784 6.39152 7.13541 6.42978 7.10571L12.1231 1.32543Z" fill="currentColor"/>
    <rect x="4" y="1.00022" width="14" height="2" rx="1" transform="rotate(90 4 1.00022)" fill="currentColor"/>
  </svg>
);

const NavRail: React.FC<NavRailProps> = ({
  activeTab,
  onTabChange,
  userInitial = 'S',
  isFiltersPanelOpen,
  onToggleFiltersPanel,
  routeControlsTitleSemibold,
  onRouteControlsTitleSemiboldChange,
  differentiatedPanelBackgrounds,
  onDifferentiatedPanelBackgroundsChange,
  allowAbsoluteNumberComparisons,
  onAllowAbsoluteNumberComparisonsChange,
  fullScreenBookmarkModal,
  onFullScreenBookmarkModalChange,
  onOpenBookmarks,
  showBookmarkSavedToast = false
}) => {
  const [isHoveringFilters, setIsHoveringFilters] = useState(false);
  const [panelStateOnHover, setPanelStateOnHover] = useState<boolean | null>(null);
  const [hasClicked, setHasClicked] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isExperimentalFeaturesOpen, setIsExperimentalFeaturesOpen] = useState(false);
  const [profileMenuPosition, setProfileMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { id: 'system' as const, label: 'System', Icon: SystemIcon },
    { id: 'routes' as const, label: 'Routes', Icon: RoutesIcon },
    { id: 'stops' as const, label: 'Stops', Icon: StopsIcon },
  ];

  const handleMouseEnter = () => {
    if (!hasClicked) {
      setIsHoveringFilters(true);
      setPanelStateOnHover(isFiltersPanelOpen);
    }
  };

  const handleMouseLeave = () => {
    setIsHoveringFilters(false);
    setPanelStateOnHover(null);
    setHasClicked(false);
  };

  const handleClick = () => {
    onToggleFiltersPanel();
    setIsHoveringFilters(false);
    setPanelStateOnHover(null);
    setHasClicked(true);
  };

  const getFiltersIcon = () => {
    if (!isHoveringFilters) {
      return <OpenFiltersIcon />;
    }
    return panelStateOnHover ? <CloseFilters2Icon /> : <OpenFilters2Icon />;
  };

  const handleProfileClick = () => {
    if (profileButtonRef.current) {
      const rect = profileButtonRef.current.getBoundingClientRect();
      setProfileMenuPosition({
        top: rect.top - 8 + window.scrollY, // 8px gap above button, transform will move menu up by its height
        left: rect.left + window.scrollX // Left-aligned with the button
      });
    }
    setIsProfileMenuOpen(!isProfileMenuOpen);
    setIsExperimentalFeaturesOpen(false); // Close submenu when reopening main menu
  };

  // Click outside to close profile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileButtonRef.current &&
        !profileButtonRef.current.contains(event.target as Node) &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  // Determine NavRail background: when differentiated is on, use secondary when filter panel is open, primary when closed
  const navRailBackground = differentiatedPanelBackgrounds
    ? (isFiltersPanelOpen ? 'var(--bg-secondary)' : 'var(--bg-primary)')
    : 'var(--bg-primary)';

  return (
    <div className="flex flex-col items-center h-full px-2 relative" style={{ paddingTop: '12px', paddingBottom: '12px', borderRadius: '28px 0 0 28px', border: '0.5px solid var(--border-default)', backgroundColor: navRailBackground, transition: 'background-color 300ms ease-in-out' }}>
      {/* Toggle Filters Button */}
      <button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex items-center justify-center w-10 h-10 rounded-default transition-colors hover:bg-btn-secondary/50 mb-4 text-text-tertiary"
        aria-label="Toggle filters panel"
        aria-expanded={isFiltersPanelOpen}
        aria-controls="filters-panel"
      >
        {getFiltersIcon()}
      </button>

      {/* Navigation Items */}
      <nav className="flex flex-col w-full flex-1" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex flex-col items-center justify-center gap-1 py-3 px-2"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div
                className={`
                  flex items-center justify-center rounded-default transition-colors
                  ${isActive
                    ? 'bg-btn-secondary text-text-tertiary'
                    : 'bg-transparent text-text-tertiary hover:bg-btn-secondary/50'
                  }
                `}
                style={{ width: '40px', height: '32px' }}
              >
                <item.Icon />
              </div>
              <span className="nav-label text-text-tertiary">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* User Profile - At Bottom */}
      <div style={{ position: 'relative' }}>
        <button
          ref={profileButtonRef}
          onClick={handleProfileClick}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-btn-secondary hover:bg-btn-secondary/80 transition-colors cursor-pointer"
          style={{
            marginBottom: '0',
            border: showBookmarkSavedToast ? '2px solid #2D7A4F' : 'none',
            transition: 'border 0.2s ease',
          }}
          aria-label="User profile"
          aria-expanded={isProfileMenuOpen}
        >
          <span className="body-large text-text-primary">
            {userInitial}
          </span>
        </button>
      </div>

      {/* Bookmark Saved Toast - rendered via portal */}
      {showBookmarkSavedToast && profileButtonRef.current && createPortal(
        <div
          style={{
            position: 'fixed',
            top: profileButtonRef.current.getBoundingClientRect().top + profileButtonRef.current.getBoundingClientRect().height / 2,
            left: profileButtonRef.current.getBoundingClientRect().right + 8,
            transform: 'translateY(-50%)',
            backgroundColor: '#2D7A4F',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)',
            zIndex: 10000,
          }}
        >
          Bookmark Saved
        </div>,
        document.body
      )}

      {/* Profile Menu Dropdown */}
      {isProfileMenuOpen && profileMenuPosition && createPortal(
        <div
          ref={profileMenuRef}
          style={{
            position: 'fixed',
            top: `${profileMenuPosition.top}px`,
            left: `${profileMenuPosition.left}px`,
            transform: 'translateY(-100%)',
            zIndex: 9999
          }}
        >
          {/* Main Menu */}
          <div
            style={{
              width: '240px',
              backgroundColor: 'var(--bg-elevated)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-large)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
              padding: '8px',
            }}
          >
            {/* Profile Header */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px 8px',
                gap: '8px',
                borderBottom: '0.5px solid var(--border-default)',
                margin: '0 -8px',
                paddingLeft: '16px',
                paddingRight: '16px',
              }}
            >
              <div
                className="flex items-center justify-center rounded-full bg-btn-secondary"
                style={{
                  width: '48px',
                  height: '48px',
                }}
              >
                <span className="text-text-primary" style={{ fontSize: '20px', fontWeight: 500 }}>
                  {userInitial}
                </span>
              </div>
              <span className="button-small text-text-primary">
                Stephencoyner@gmail.com
              </span>
            </div>

            {/* Bookmarks */}
            <div
              className="flex items-center gap-3 p-3 rounded-default hover:bg-bg-primary transition-colors cursor-pointer"
              style={{ marginTop: '8px' }}
              onClick={() => {
                setIsProfileMenuOpen(false);
                onOpenBookmarks();
              }}
            >
              <BookmarksIcon />
              <span className="button-small text-text-primary">
                Bookmarks
              </span>
            </div>

            {/* Experimental Features */}
            <div
              className="flex items-center gap-3 p-3 rounded-default hover:bg-bg-primary transition-colors cursor-pointer"
              style={isExperimentalFeaturesOpen ? { backgroundColor: 'var(--bg-primary)' } : undefined}
              onClick={() => setIsExperimentalFeaturesOpen(!isExperimentalFeaturesOpen)}
            >
              <ExperimentsIcon />
              <span className="button-small text-text-primary">
                Experimental Features
              </span>
            </div>

            {/* Settings */}
            <div
              className="flex items-center gap-3 p-3 rounded-default hover:bg-bg-primary transition-colors cursor-pointer"
              onClick={() => {
                setIsProfileMenuOpen(false);
                // TODO: Open settings modal
              }}
            >
              <SettingsIcon />
              <span className="button-small text-text-primary">
                Settings
              </span>
            </div>
          </div>

          {/* Experimental Features Submenu */}
          {isExperimentalFeaturesOpen && (
            <div
              style={{
                position: 'absolute',
                left: '248px', // 240px menu width + 8px gap
                bottom: 0,
                width: '280px',
                backgroundColor: 'var(--bg-elevated)',
                border: '0.5px solid var(--border-default)',
                borderRadius: 'var(--radius-large)',
                boxShadow: 'var(--shadow-lg)',
                padding: '8px',
              }}
            >
              {/* Toggle Item - Route Controls Title Semibold */}
              <div
                className="flex items-center justify-between p-3 rounded-default hover:bg-bg-primary transition-colors cursor-pointer"
                onClick={() => onRouteControlsTitleSemiboldChange(!routeControlsTitleSemibold)}
              >
                <span className="button-small text-text-primary" style={{ fontSize: '13px' }}>
                  Route Controls Title Semibold
                </span>
                <div
                  style={{
                    width: '36px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: routeControlsTitleSemibold ? 'var(--text-primary)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-default)',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-elevated)',
                      position: 'absolute',
                      top: '1px',
                      left: routeControlsTitleSemibold ? '19px' : '1px',
                      transition: 'left 0.2s ease'
                    }}
                  />
                </div>
              </div>
              {/* Toggle Item - Differentiated Panel Backgrounds */}
              <div
                className="flex items-center justify-between p-3 rounded-default hover:bg-bg-primary transition-colors cursor-pointer"
                onClick={() => onDifferentiatedPanelBackgroundsChange(!differentiatedPanelBackgrounds)}
              >
                <span className="button-small text-text-primary" style={{ fontSize: '13px' }}>
                  Differentiated Panel Backgrounds
                </span>
                <div
                  style={{
                    width: '36px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: differentiatedPanelBackgrounds ? 'var(--text-primary)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-default)',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-elevated)',
                      position: 'absolute',
                      top: '1px',
                      left: differentiatedPanelBackgrounds ? '19px' : '1px',
                      transition: 'left 0.2s ease'
                    }}
                  />
                </div>
              </div>
              {/* Toggle Item - Allow Absolute Number Comparisons */}
              <div
                className="flex items-center justify-between p-3 rounded-default hover:bg-bg-primary transition-colors cursor-pointer"
                onClick={() => onAllowAbsoluteNumberComparisonsChange(!allowAbsoluteNumberComparisons)}
              >
                <span className="button-small text-text-primary" style={{ fontSize: '13px' }}>
                  Absolute Number Comparisons
                </span>
                <div
                  style={{
                    width: '36px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: allowAbsoluteNumberComparisons ? 'var(--text-primary)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-default)',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-elevated)',
                      position: 'absolute',
                      top: '1px',
                      left: allowAbsoluteNumberComparisons ? '19px' : '1px',
                      transition: 'left 0.2s ease'
                    }}
                  />
                </div>
              </div>
              {/* Toggle Item - Full Screen Bookmark Modal */}
              <div
                className="flex items-center justify-between p-3 rounded-default hover:bg-bg-primary transition-colors cursor-pointer"
                onClick={() => onFullScreenBookmarkModalChange(!fullScreenBookmarkModal)}
              >
                <span className="button-small text-text-primary" style={{ fontSize: '13px' }}>
                  Full Screen Bookmark Modal
                </span>
                <div
                  style={{
                    width: '36px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: fullScreenBookmarkModal ? 'var(--text-primary)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-default)',
                    position: 'relative',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-elevated)',
                      position: 'absolute',
                      top: '1px',
                      left: fullScreenBookmarkModal ? '19px' : '1px',
                      transition: 'left 0.2s ease'
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default NavRail;
