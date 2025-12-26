/**
 * @fileoverview Tests for Blocks & Cannons application registration.
 *
 * Uses framework testing utilities for standard app tests.
 */

import { createAppManifestTests, createAppRegistrationTests } from '@gesture-app/framework-testing';
import { describe } from 'vitest';
import { APP_ID, APP_MANIFEST, registerApp } from '../src/index.js';

describe('Blocks & Cannons App', () => {
  // Use framework test utilities for standard manifest and registration tests
  createAppManifestTests(APP_ID, APP_MANIFEST);
  createAppRegistrationTests(APP_ID, registerApp);
});
