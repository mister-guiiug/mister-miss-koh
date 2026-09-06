import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { motionLevel, useMotionLevel } from './motion';
import { useAppStore } from '../store/useAppStore';

describe('motionLevel', () => {
  it('« Réduire les mouvements » l’emporte sur « Animations »', () => {
    expect(motionLevel(true, false)).toBe('full');
    expect(motionLevel(false, false)).toBe('essential');
    expect(motionLevel(true, true)).toBe('none');
    expect(motionLevel(false, true)).toBe('none');
  });
});

describe('useMotionLevel', () => {
  afterEach(() => {
    useAppStore.setState({ animations: true, reduceMotion: false });
    delete document.documentElement.dataset.motion;
  });

  it('pose data-motion sur <html> et suit les deux réglages', () => {
    renderHook(() => useMotionLevel());
    expect(document.documentElement.dataset.motion).toBe('full');

    act(() => useAppStore.getState().setAnimations(false));
    expect(document.documentElement.dataset.motion).toBe('essential');

    act(() => useAppStore.getState().setReduceMotion(true));
    expect(document.documentElement.dataset.motion).toBe('none');

    // Rendre les animations ne suffit pas tant que le mouvement est réduit.
    act(() => useAppStore.getState().setAnimations(true));
    expect(document.documentElement.dataset.motion).toBe('none');
  });
});
