import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type SearchBarProps = {
  compact?: boolean;
};

export function SearchBar({ compact = false }: SearchBarProps) {
  const navigate = useNavigate();
  const [values, setValues] = useState({
    where: 'Dublin',
    date: '2026-10-15',
    start: '18:00',
    end: '20:00',
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate('/chargers');
  };

  return (
    <form className={compact ? 'search-form compact' : 'search-form'} onSubmit={handleSubmit}>
      <label className="field">
        <span>Where?</span>
        <input
          aria-label="Where"
          value={values.where}
          onChange={(event) => setValues((current) => ({ ...current, where: event.target.value }))}
          placeholder="Dublin"
        />
      </label>

      <label className="field">
        <span>Date</span>
        <input
          aria-label="Date"
          type="date"
          value={values.date}
          onChange={(event) => setValues((current) => ({ ...current, date: event.target.value }))}
        />
      </label>

      <label className="field">
        <span>Start time</span>
        <input
          aria-label="Start time"
          type="time"
          value={values.start}
          onChange={(event) => setValues((current) => ({ ...current, start: event.target.value }))}
        />
      </label>

      <label className="field">
        <span>End time</span>
        <input
          aria-label="End time"
          type="time"
          value={values.end}
          onChange={(event) => setValues((current) => ({ ...current, end: event.target.value }))}
        />
      </label>

      <button type="submit" className="primary-action search-button">
        <Search size={16} />
        Find a charger
      </button>
    </form>
  );
}
