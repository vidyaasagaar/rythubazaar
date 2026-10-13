import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="container-page">
      <EmptyState
        title={t('error.NOT_FOUND')}
        action={
          <Link to="/" className="btn btn-secondary">
            {t('nav.home')}
          </Link>
        }
      />
    </div>
  );
}
