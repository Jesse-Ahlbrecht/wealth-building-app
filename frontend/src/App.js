/**
 * Wealth Management App - Main Application
 * 
 * Refactored to use:
 * - Context providers for global state
 * - Custom hooks for business logic
 * - API layer for data fetching
 * - Page components for features
 */

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './styles/index.css';
import logo from './assets/logo.svg';

// Context Providers
import { AuthProvider, useAuthContext } from './context/AuthContext';
import { AppProvider, useAppContext } from './context/AppContext';

// Pages
import MonthlyOverviewPage from './pages/MonthlyOverviewPage';
import ChartsPage from './pages/ChartsPage';
import AccountsPage from './pages/AccountsPage';
import BrokerPage from './pages/BrokerPage';
import LoansPage from './pages/LoansPage';
import ProjectionPage from './pages/ProjectionPage';
import DocumentsPage from './pages/DocumentsPage';

// Helper function to convert label to URL-friendly path
const labelToPath = (label) => {
  return '/' + label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
};

// Constants
const TAB_ITEMS = [
  { key: 'monthly-overview', label: 'Monthly Overview' },
  { key: 'charts', label: 'Savings Statistics' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'broker', label: 'Broker' },
  { key: 'loans', label: 'Loans' },
  { key: 'projection', label: 'Wealth Projection' },
  { key: 'data', label: 'Manage Files' }
].map(item => ({
  ...item,
  path: labelToPath(item.label)
}));

// Map tab keys to paths for easy lookup
const TAB_KEY_TO_PATH = Object.fromEntries(
  TAB_ITEMS.map(item => [item.key, item.path])
);

// Map paths to tab keys for reverse lookup
const PATH_TO_TAB_KEY = Object.fromEntries(
  TAB_ITEMS.map(item => [item.path, item.key])
);

const TAB_DESCRIPTIONS = {
  'monthly-overview': 'Track current month progress and review historical spending patterns',
  'charts': 'Track savings progress and rates over time',
  'accounts': 'Review balances across cash and savings accounts',
  'broker': 'Inspect performance of your investment accounts',
  'loans': 'Stay on top of loan balances and payments',
  'projection': 'Model future net worth using your current savings rate',
  'data': 'Upload and manage statements, broker reports, and loan documents'
};


/**
 * Login Component
 */
function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const { login, register } = useAuthContext();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isRegistering) {
        const result = await register(email, password, name);
        if (result.success) {
          setMessage('Registration successful! Please check your email to verify your account.');
          setIsRegistering(false);
          setEmail('');
          setPassword('');
          setName('');
        } else {
          setError(result.error || 'Registration failed');
        }
      } else {
        const result = await login(email, password);
        if (result.success) {
          onLogin();
        } else {
          setError(result.error || 'Login failed');
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img src={logo} alt="Wealth Management Logo" />
        </div>
        <h2>{isRegistering ? 'Create Account' : 'Welcome Back'}</h2>
        <p className="login-subtitle">
          {isRegistering ? 'Sign up to start tracking your wealth' : 'Sign in to your account'}
        </p>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        <form onSubmit={handleSubmit}>
          {isRegistering && (
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Please wait...' : (isRegistering ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div className="login-footer">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setMessage('');
            }}
            className="btn-link"
            disabled={loading}
          >
            {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}


/**
 * Main App Content
 */
function AppContent() {
  const { isAuthenticated, isLoading, logout } = useAuthContext();
  const {
    defaultCurrency,
    setDefaultCurrency,
    theme,
    setTheme,
    documentsProcessing,
    documentsProcessingCount
  } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Derive activeTab from current URL pathname
  const getActiveTabFromPath = (pathname) => {
    // Check if pathname matches any of our defined paths
    if (PATH_TO_TAB_KEY[pathname]) {
      return PATH_TO_TAB_KEY[pathname];
    }
    // Default to monthly-overview
    return 'monthly-overview';
  };

  const activeTab = getActiveTabFromPath(location.pathname);

  // Navigation handler that updates URL
  const handleTabChange = (tabKey) => {
    const path = TAB_KEY_TO_PATH[tabKey] || '/monthly-overview';
    navigate(path);
  };

  // Get resolved theme (light/dark) based on theme preference and system settings
  const getResolvedTheme = useCallback(() => {
    if (theme === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  // Apply theme class to body and update favicon
  useEffect(() => {
    const resolvedTheme = getResolvedTheme();
    if (resolvedTheme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }

    // Update favicon based on theme
    const favicon = document.getElementById('favicon');
    if (favicon) {
      favicon.href = resolvedTheme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg';
    }
  }, [theme, getResolvedTheme]);

  // Listen for system preference changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const resolvedTheme = getResolvedTheme();
      if (resolvedTheme === 'dark') {
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme, getResolvedTheme]);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
  };

  useEffect(() => {
    // Track authentication state changes
    if (isAuthenticated) {
      console.log('User authenticated');
    }
  }, [isAuthenticated]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => console.log('Login successful')} />;
  }

  return (
    <div className="App">
      {/* Top Header */}
      <header className="top-header">
        <button
          className={`sidebar-toggle ${sidebarOpen ? 'active' : ''}`}
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <div className="sidebar-toggle-icon">
            <span></span>
          </div>
        </button>
        <h1 className="top-header-title">Wealth Management</h1>
        {/* Processing Alert - Show when documents are processing and user is not on documents tab */}
        {documentsProcessing && activeTab !== 'data' && (
          <div
            className="processing-alert"
            onClick={() => handleTabChange('data')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              borderRadius: '6px',
              color: '#2563eb',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              marginLeft: '16px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
            }}
          >
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '12px' }}></i>
            <span>
              Processing {documentsProcessingCount} document{documentsProcessingCount !== 1 ? 's' : ''}...
            </span>
            <i className="fa-solid fa-arrow-right" style={{ fontSize: '10px', marginLeft: '4px' }}></i>
          </div>
        )}
        <button
          className="settings-button"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          <i className="fa-solid fa-gear"></i>
        </button>
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <nav className="sidebar-nav">
          <div className="sidebar-tabs-container">
            {TAB_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`sidebar-tab ${activeTab === item.key ? 'active' : ''}`}
                onClick={() => {
                  handleTabChange(item.key);
                  closeSidebar();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            className="sidebar-tab sidebar-logout"
            onClick={() => {
              logout();
              closeSidebar();
            }}
          >
            Log Out
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="app-layout">
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/monthly-overview" replace />} />
            <Route path="/monthly-overview" element={
              <>
                <div className="content-header">
                  <h2>{TAB_ITEMS.find(item => item.key === 'monthly-overview')?.label}</h2>
                  <p>{TAB_DESCRIPTIONS['monthly-overview']}</p>
                </div>
                <MonthlyOverviewPage />
              </>
            } />
            <Route path="/savings-statistics" element={
              <>
                <div className="content-header">
                  <h2>{TAB_ITEMS.find(item => item.key === 'charts')?.label}</h2>
                  <p>{TAB_DESCRIPTIONS['charts']}</p>
                </div>
                <ChartsPage />
              </>
            } />
            <Route path="/accounts" element={
              <>
                <div className="content-header">
                  <h2>{TAB_ITEMS.find(item => item.key === 'accounts')?.label}</h2>
                  <p>{TAB_DESCRIPTIONS['accounts']}</p>
                </div>
                <AccountsPage />
              </>
            } />
            <Route path="/broker" element={
              <>
                <div className="content-header">
                  <h2>{TAB_ITEMS.find(item => item.key === 'broker')?.label}</h2>
                  <p>{TAB_DESCRIPTIONS['broker']}</p>
                </div>
                <BrokerPage />
              </>
            } />
            <Route path="/loans" element={
              <>
                <div className="content-header">
                  <h2>{TAB_ITEMS.find(item => item.key === 'loans')?.label}</h2>
                  <p>{TAB_DESCRIPTIONS['loans']}</p>
                </div>
                <LoansPage />
              </>
            } />
            <Route path="/wealth-projection" element={
              <>
                <div className="content-header">
                  <h2>{TAB_ITEMS.find(item => item.key === 'projection')?.label}</h2>
                  <p>{TAB_DESCRIPTIONS['projection']}</p>
                </div>
                <ProjectionPage />
              </>
            } />
            <Route path="/manage-files" element={<DocumentsPage />} />
          </Routes>
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay open" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-modal open" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="settings-section">
                <h3 className="settings-section-title">Theme</h3>
                <p className="settings-section-description">
                  Choose your preferred color theme for the application.
                </p>
                <div className="currency-selector">
                  <button
                    className={`currency-option ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                  >
                    <span className="currency-code">Light</span>
                    <span className="currency-name">Light Mode</span>
                  </button>
                  <button
                    className={`currency-option ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                  >
                    <span className="currency-code">Dark</span>
                    <span className="currency-name">Dark Mode</span>
                  </button>
                  <button
                    className={`currency-option ${theme === 'system' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('system')}
                  >
                    <span className="currency-code">System</span>
                    <span className="currency-name">Follow System</span>
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <h3 className="settings-section-title">Default Currency</h3>
                <p className="settings-section-description">
                  Select your preferred currency for displaying amounts throughout the app.
                </p>
                <div className="currency-selector">
                  <button
                    className={`currency-option ${defaultCurrency === 'CHF' ? 'active' : ''}`}
                    onClick={() => {
                      setDefaultCurrency('CHF');
                      setShowSettings(false);
                    }}
                  >
                    <span className="currency-code">CHF</span>
                    <span className="currency-name">Swiss Franc</span>
                  </button>
                  <button
                    className={`currency-option ${defaultCurrency === 'EUR' ? 'active' : ''}`}
                    onClick={() => {
                      setDefaultCurrency('EUR');
                      setShowSettings(false);
                    }}
                  >
                    <span className="currency-code">EUR</span>
                    <span className="currency-name">Euro</span>
                  </button>
                  <button
                    className={`currency-option ${defaultCurrency === 'USD' ? 'active' : ''}`}
                    onClick={() => {
                      setDefaultCurrency('USD');
                      setShowSettings(false);
                    }}
                  >
                    <span className="currency-code">USD</span>
                    <span className="currency-name">US Dollar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Root App Component with Providers
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
