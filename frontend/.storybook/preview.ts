import type { Preview } from '@storybook/react';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'pochta-light',
      values: [
        { name: 'pochta-light', value: '#F8FAFC' },
        { name: 'pochta-white', value: '#FFFFFF' },
        { name: 'pochta-navy', value: '#010E3E' },
      ],
    },
  },
};

export default preview;
