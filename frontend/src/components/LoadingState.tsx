type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = 'Looking for the best nearby options...' }: LoadingStateProps) {
  return (
    <div className="state-panel loading-state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
