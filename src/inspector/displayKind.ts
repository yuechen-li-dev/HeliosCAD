/** The kind a person reads: kernel materializers (`AirHoleSimpleShaftMaterializer`) are solids. */
export function displayKind(kind: string) {
  return kind.endsWith('Materializer') ? 'Solid' : kind;
}
