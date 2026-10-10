type ErrorStateProps = {
  title?: string;
  message: string;
};

export function ErrorState({ title = 'Something went wrong', message }: ErrorStateProps) {
  return (
    <div className="state-panel error-state" role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
