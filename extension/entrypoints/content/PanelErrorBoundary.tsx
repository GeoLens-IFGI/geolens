import React from 'react';

type Props = {
  children: React.ReactNode;
  label?: string;
};

type State = {
  error: Error | null;
};

/** Keeps a panel failure from tearing down the whole inspector UI. */
export class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-red-800">
            {this.props.label ?? 'This panel'} could not be displayed.
          </p>
          <p className="mt-2 text-xs text-red-600/80 break-words">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
