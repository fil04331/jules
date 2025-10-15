// app/components/studio/__tests__/MainView.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import MainView from '../MainView';

describe('MainView', () => {
  it('renders the main view with project generator and importer', () => {
    // Mock the props
    const mockProps = {
      handleGenerateProject: jest.fn(),
      handleImportRepo: jest.fn(),
      setProjectPrompt: jest.fn(),
      setRepoUrl: jest.fn(),
      projectPrompt: '',
      repoUrl: '',
      isGenerating: false,
      isImporting: false,
    };

    render(<MainView {...mockProps} />);

    // Check that the main headings are present
    expect(screen.getByText('Studio de Projet')).toBeInTheDocument();
    expect(screen.getByText('Générer depuis un Prompt')).toBeInTheDocument();
    expect(screen.getByText('Importer depuis GitHub')).toBeInTheDocument();
  });
});
