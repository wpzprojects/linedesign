# Data Model

## Proyecto

```json
{
  "name": "string",
  "alignment": {
    "vertices": []
  },
  "structures": [],
  "conductor": {},
  "hypotheses": []
}
```

## Alineación

- `vertices`: lista de puntos con `id`, `x`, `y`, `z`
- El sistema considera coordenadas planas con eje X/Y y elevación Z

## Estructuras

- `id`: identificador único
- `name`: etiqueta visual
- `station`: distancia acumulada desde el origen
- `x`, `y`, `z`: coordenadas espaciales
- `height`: altura de la estructura

## Conductor

- `name`
- `diameter`
- `weightPerLength`
- `elasticModulus`
- `thermalExpansionCoef`
- `ultimateStrength`

## Hipótesis

Cada caso de carga incluye:

- `id`
- `name`
- `temperature`
- `wind`
- `ice`

## Suposiciones actuales

- Unidades SI métricas
- Pérdida de elasticidad no considerada
- Conductor homogéneo
- Cálculo geométrico inicial simplificado
