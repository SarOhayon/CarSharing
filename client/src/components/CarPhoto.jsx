import Icon from './Icon.jsx';

// The car's uploaded photo, or a quiet placeholder until one is added in Admin.
export default function CarPhoto({ car, className = '' }) {
  if (car?.photo) return <img src={car.photo} alt={car.name} draggable={false} className={className} />;
  return (
    <span className={`car-placeholder ${className}`} title="No photo yet">
      <Icon name="car" strokeWidth={1.5} />
    </span>
  );
}
