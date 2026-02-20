import { MovementListEditor } from '../workouts/InlineMovementEditor';
import type { MovementEditorProps } from './types';

interface Props extends MovementEditorProps {
  show?: boolean;
}

export function MovementEditorBundle({ show = true, ...props }: Props) {
  if (!show || !props.movements || props.movements.length === 0) return null;

  return (
    <MovementListEditor
      movements={props.movements}
      selectedAlternatives={props.selectedAlternatives}
      customDistances={props.customDistances}
      customTimes={props.customTimes}
      customWeights={props.customWeights}
      customReps={props.customReps}
      customCalories={props.customCalories}
      movementImplementCounts={props.movementImplementCounts}
      movementImplementFixed={props.movementImplementFixed}
      onAlternativeChange={props.onAlternativeChange}
      onDistanceChange={props.onDistanceChange}
      onTimeChange={props.onTimeChange}
      onWeightChange={props.onWeightChange}
      onRepsChange={props.onRepsChange}
      onCaloriesChange={props.onCaloriesChange}
      onImplementCountChange={props.onImplementCountChange}
      readOnly={props.readOnly}
      labels={props.labels}
    />
  );
}
