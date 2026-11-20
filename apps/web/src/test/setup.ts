import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetAuthSessionForTests } from '../lib/auth-session';
import { resetGuestSessionForTests } from '../lib/guest-session';

afterEach(() => {
  cleanup();
  resetAuthSessionForTests();
  resetGuestSessionForTests();
  localStorage.clear();
});
