import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Page not found</h1>
        <p className="muted">That screen does not exist.</p>
        <Link to="/scan" className="btn btn-primary">
          Go to the scanner menu
        </Link>
      </div>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Supervisor access required</h1>
        <p className="muted">
          The admin console is for supervisors and administrators. Your account is an operator.
        </p>
        <Link to="/scan" className="btn btn-primary">
          Back to the scanner
        </Link>
      </div>
    </div>
  );
}
