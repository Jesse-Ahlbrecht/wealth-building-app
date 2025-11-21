/**
 * useFileUpload Hook
 * 
 * File upload with progress tracking
 */

import { useState, useCallback } from 'react';

export const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  const handleProgress = useCallback((newPhase, newProgress, newMessage, extra = {}) => {
    setPhase(newPhase);
    setProgress(newProgress);
    setMessage(newMessage);
  }, []);

  const startUpload = useCallback(() => {
    setUploading(true);
    setProgress(0);
    setPhase('');
    setMessage('');
    setError(null);
  }, []);

  const finishUpload = useCallback((success, errorMessage = null) => {
    setUploading(false);
    if (!success && errorMessage) {
      setError(errorMessage);
    }
  }, []);

  const reset = useCallback(() => {
    setUploading(false);
    setProgress(0);
    setPhase('');
    setMessage('');
    setError(null);
  }, []);

  return {
    uploading,
    progress,
    phase,
    message,
    error,
    handleProgress,
    startUpload,
    finishUpload,
    reset,
  };
};

