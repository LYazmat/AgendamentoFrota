# Manual de Integração com Django Backend 🐍

Este manual detalha como integrar este painel de agendamento de frotas (desenvolvido em **React + TypeScript + Tailwind**) como um plugin/aplicativo acoplado a um servidor **Django**.

Diferente de sistemas legados em JQuery, a compilação moderna via Vite gera arquivos estáticos altamente otimizados (HTML, CSS e JS unificados) dentro da pasta `dist/`. Isso permite que o Django sirva os arquivos de duas formas principais:
1. **Single Page Application (SPA)** autônoma integrada às suas Views do Django.
2. **Plugin Embutido** através de um `<iframe>` apontando para o painel hospedado.

---

## 📂 1. Estruturação do Frontend como Estáticos no Django

Ao executar `npm run build` no ambiente do frontend React, o Vite gera os arquivos finais na pasta `dist/`:
```text
dist/
  ├── index.html
  └── assets/
        ├── index-XXXX.js
        └── index-XXXX.css
```

### Como configurar no seu projeto Django:
Insira os arquivos gerados dentro da pasta de recursos estáticos (`static/`) do seu app Django (por exemplo, dentro de um app chamado `fleet`):

```text
seu_projeto_django/
  ├── static/
  │    └── fleet/
  │          ├── assets/
  │          │    ├── index-XXXX.js
  │          │    └── index-XXXX.css
  │          └── index.html  <-- Pode ser renomeado para "fleet_dashboard.html" e colocado em templates/
  ├── templates/
  │    └── fleet/
  │          └── dashboard.html  <-- Carrega os recursos acima
```

Na sua View do Django ou template, você pode servir o dashboard injetando os estáticos do Django:

```html
<!-- templates/fleet/dashboard.html -->
{% load static %}
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel de Controle - Frota</title>
    <!-- CSS Compilado do React -->
    <link rel="stylesheet" href="{% static 'fleet/assets/index-XXXX.css' %}">
</head>
<body class="bg-slate-100">
    <div id="root"></div>

    <!-- JS Compilado do React -->
    <script src="{% static 'fleet/assets/index-XXXX.js' %}" type="module"></script>
</body>
</html>
```

*(Nota: Sempre que fizer o build do frontend, lembre-se de rodar `python manage.py collectstatic` no seu servidor Django!)*

---

## 🗄️ 2. Modelos de Dados no Django (`models.py`)

Para persistir os dados dos veículos e agendamentos no seu banco de dados (PostgreSQL, SQLite, MySQL, etc.), crie os seguintes modelos no seu arquivo `models.py`:

```python
# seu_app/models.py
from django.db import models

class Vehicle(models.Model):
    VEHICLE_TYPES = [
        ('sedan', 'Sedã'),
        ('suv', 'SUV'),
        ('pickup', 'Picape'),
        ('van', 'Van'),
        ('hatch', 'Hatchback'),
        ('eletrico', 'Elétrico'),
    ]
    
    STATUS_CHOICES = [
        ('disponivel', 'Disponível'),
        ('uso', 'Em Uso'),
        ('manutencao', 'Em Manutenção'),
        ('canteiro', 'Alocado em Canteiro'),
    ]

    FUEL_CHOICES = [
        ('Flex', 'Flex'),
        ('Gasolina', 'Gasolina'),
        ('Etanol', 'Etanol'),
        ('Diesel', 'Diesel'),
        ('Híbrido', 'Híbrido'),
        ('Elétrico', 'Elétrico'),
    ]

    id = models.CharField(max_length=50, primary_key=True)  # Suporta os IDs "v_timestamp" ou UUIDs
    brand = models.CharField(max_length=50) # Marca
    model = models.CharField(max_length=50) # Modelo
    year = models.IntegerField()
    plate = models.CharField(max_length=10, unique=True) # Placa
    type = models.CharField(max_length=20, choices=VEHICLE_TYPES, default='sedan')
    fuel = models.CharField(max_length=20, choices=FUEL_CHOICES, default='Flex')
    km = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='disponivel')
    capacity = models.IntegerField(default=5)
    color = models.CharField(max_length=30)
    image_url = models.URLField(max_length=500, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    
    # Novos campos adicionados para suporte a canteiros e manutenções preventivas
    construction_site = models.CharField(max_length=150, blank=True, null=True)
    next_preventive_date = models.CharField(max_length=15, blank=True, null=True) # YYYY-MM-DD
    preventive_period_month = models.IntegerField(blank=True, null=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.brand} {self.model} ({self.plate})"


class Driver(models.Model):
    id = models.CharField(max_length=50, primary_key=True) # ID "d_timestamp" ou UUID
    name = models.CharField(max_length=100)
    cpf = models.CharField(max_length=14, unique=True)
    cnh = models.CharField(max_length=15, unique=True)
    cnh_expiry = models.CharField(max_length=15) # YYYY-MM-DD
    cnh_category = models.CharField(max_length=2, default='B')
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} (CNH: {self.cnh})"


class Booking(models.Model):
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('ativo', 'Ativo'),
        ('concluido', 'Concluído'),
        ('cancelado', 'Cancelado'),
    ]

    id = models.CharField(max_length=50, primary_key=True)  # Suporta os IDs "b_timestamp" ou sequenciais
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='bookings')
    driver_name = models.CharField(max_length=100)
    driver_cpf = models.CharField(max_length=14)
    driver_cnh = models.CharField(max_length=15)
    driver_cnh_category = models.CharField(max_length=2)
    purpose = models.CharField(max_length=250)
    start_date = models.CharField(max_length=30)  # Formato ISO string: YYYY-MM-DDTHH:mm
    end_date = models.CharField(max_length=30)    # Formato ISO string: YYYY-MM-DDTHH:mm
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendente')
    notes = models.TextField(blank=True, null=True)
    
    # Informações de Auditoria e Retirada/Devolução em tempo real
    actual_start_km = models.IntegerField(blank=True, null=True)
    actual_end_km = models.IntegerField(blank=True, null=True)
    actual_start_date = models.CharField(max_length=30, blank=True, null=True)
    actual_end_date = models.CharField(max_length=30, blank=True, null=True)
    created_at = models.CharField(max_length=30)

    def __str__(self):
        return f"Reserva {self.id} - Condutor: {self.driver_name} ({self.vehicle.model})"


class Maintenance(models.Model):
    TYPE_CHOICES = [
        ('preventiva', 'Preventiva'),
        ('corretiva', 'Corretiva'),
        ('revisao', 'Revisão'),
        ('outro', 'Outro'),
    ]

    STATUS_CHOICES = [
        ('concluido', 'Concluído'),
        ('agendado', 'Agendado'),
    ]

    id = models.CharField(max_length=50, primary_key=True)  # Suporta os IDs "m_timestamp" ou sequencias
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='maintenances')
    description = models.CharField(max_length=200)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
    date = models.CharField(max_length=15)  # YYYY-MM-DD
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='preventiva')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='concluido')
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Manutenção [{self.id}] - Veículo: {self.vehicle.model} ({self.date})"
```

---

## 📡 3. Views da API Django (Estilo REST)

Você pode criar uma API robusta de forma rápida usando o **Django REST Framework (DRF)** ou puro Django `JsonResponse`. Abaixo, a implementação recomendada usando o Django REST Framework:

### Serializadores (`serializers.py`):
```python
# seu_app/serializers.py
from rest_framework import serializers
from .models import Vehicle, Booking, Maintenance, Driver

class VehicleSerializer(serializers.ModelSerializer):
    imageUrl = serializers.URLField(source='image_url', required=False, allow_null=True, allow_blank=True)
    constructionSite = serializers.CharField(source='construction_site', required=False, allow_null=True, allow_blank=True)
    nextPreventiveDate = serializers.CharField(source='next_preventive_date', required=False, allow_null=True, allow_blank=True)
    preventivePeriodMonth = serializers.IntegerField(source='preventive_period_month', required=False, allow_null=True)

    class Meta:
        model = Vehicle
        fields = [
            'id', 'brand', 'model', 'year', 'plate', 'type', 'fuel', 
            'km', 'status', 'capacity', 'color', 'imageUrl', 'notes',
            'constructionSite', 'nextPreventiveDate', 'preventivePeriodMonth', 'active'
        ]

class DriverSerializer(serializers.ModelSerializer):
    cnhExpiry = serializers.CharField(source='cnh_expiry')
    cnhCategory = serializers.CharField(source='cnh_category')

    class Meta:
        model = Driver
        fields = ['id', 'name', 'cpf', 'cnh', 'cnhExpiry', 'cnhCategory', 'active']

class BookingSerializer(serializers.ModelSerializer):
    # Permite receber o ID do veículo ao criar ou ler
    vehicleId = serializers.PrimaryKeyRelatedField(
        source='vehicle', 
        queryset=Vehicle.objects.all()
    )
    # Renomeação de campos camelCase para o React
    driverName = serializers.CharField(source='driver_name')
    driverCpf = serializers.CharField(source='driver_cpf')
    driverCnh = serializers.CharField(source='driver_cnh')
    driverCnhCategory = serializers.CharField(source='driver_cnh_category')
    startDate = serializers.CharField(source='start_date')
    endDate = serializers.CharField(source='end_date')
    actualStartKm = serializers.IntegerField(source='actual_start_km', required=False, allow_null=True)
    actualEndKm = serializers.IntegerField(source='actual_end_km', required=False, allow_null=True)
    actualStartDate = serializers.CharField(source='actual_start_date', required=False, allow_null=True)
    actualEndDate = serializers.CharField(source='actual_end_date', required=False, allow_null=True)
    createdAt = serializers.CharField(source='created_at')

    class Meta:
        model = Booking
        fields = [
            'id', 'vehicleId', 'driverName', 'driverCpf', 'driverCnh', 
            'driverCnhCategory', 'purpose', 'startDate', 
            'endDate', 'status', 'notes', 'actualStartKm', 'actualEndKm', 
            'actualStartDate', 'actualEndDate', 'createdAt'
        ]

class MaintenanceSerializer(serializers.ModelSerializer):
    vehicleId = serializers.PrimaryKeyRelatedField(
        source='vehicle',
        queryset=Vehicle.objects.all()
    )
    
    class Meta:
        model = Maintenance
        fields = ['id', 'vehicleId', 'description', 'cost', 'date', 'type', 'status', 'notes']
```

### Views (`views.py`):
```python
# seu_app/views.py
from rest_framework import viewsets
from .models import Vehicle, Booking, Maintenance, Driver
from .serializers import VehicleSerializer, BookingSerializer, MaintenanceSerializer, DriverSerializer

class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer

class DriverViewSet(viewsets.ModelViewSet):
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer

class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer

class MaintenanceViewSet(viewsets.ModelViewSet):
    queryset = Maintenance.objects.all()
    serializer_class = MaintenanceSerializer
```

### URLs do Django (`urls.py`):
```python
# seu_projeto/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from seu_app.views import VehicleViewSet, BookingViewSet, MaintenanceViewSet, DriverViewSet

router = DefaultRouter()
router.register(r'vehicles', VehicleViewSet)
router.register(r'drivers', DriverViewSet)
router.register(r'bookings', BookingViewSet)
router.register(r'maintenance', MaintenanceViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
]
```

---

## 🛡️ 4. Segurança do Django (CORS e CSRF)

#### A. Habilitar CORS (Cross-Origin Resource Sharing)
Se o seu app React e o Django rodarem em servidores diferentes em desenvolvimento (ex: React na porta `3000` e Django na `8000`), você deve instalar o pacote `django-cors-headers`:

```bash
pip install django-cors-headers
```

Adicione ao seu `settings.py`:
```python
# settings.py
INSTALLED_APPS = [
    ...
    'corsheaders',
    ...
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware', # Deve vir na parte superior!
    'django.middleware.common.CommonMiddleware',
    ...
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",  # Origem de desenvolvimento do React
]
```

#### B. Proteção CSRF Integrada
O serviço do React (`src/services/api.ts`) já está pré-configurado de fábrica para interceptar o cookie padrão `csrftoken` do Django e passá-lo automaticamente no cabeçalho `X-CSRFToken` em todas as requisições que modifiquem dados (`POST`, `PUT`, `DELETE`).

Isso garante que sua transição entre ambientes ocorra sem falhas ou erros `403 Forbidden` devido a validações de sessão.

---

## 🔌 5. Ativação Final no React

Para fazer o painel React parar de usar o armazenamento fictício do navegador (`localStorage`) e começar a persistir tudo no seu banco de dados Django:

1. Abra o arquivo `/src/services/api.ts`.
2. Altere a constante `USE_DJANGO_API` para `true`:

```typescript
// /src/services/api.ts
export const USE_DJANGO_API = true;
```

3. Se desejar, configure uma URL base personalizada em desenvolvimento (como `http://localhost:8000`), usando a variável de ambiente `VITE_API_URL` do seu arquivo `.env.example`.

Pronto! Seu painel agora rodará de forma síncrona com todas as tabelas e lógicas de negócio do seu ecossistema Django! 🚀

---

## 🧭 6. Resumo Detalhado dos Endpoints Necessários

Para garantir o perfeito funcionamento, sua API Django deve responder exatamente aos seguintes contratos de dados (JSON):

### A. Veículos (`/api/vehicles/`)
*   `GET /api/vehicles/`
    *   **Descrição**: Retorna a lista contendo todos os veículos cadastrados.
    *   **Resposta (Exemplo)**:
        ```json
        [
          {
            "id": "v_123456",
            "brand": "Toyota",
            "model": "Corolla",
            "year": 2024,
            "plate": "ABC1D23",
            "type": "sedan",
            "fuel": "Flex",
            "km": 15000,
            "status": "disponivel",
            "capacity": 5,
            "color": "Prata",
            "image_url": null,
            "notes": "Arla 32 desnecessário."
          }
        ]
        ```
*   `POST /api/vehicles/`
    *   **Descrição**: Cadastra um novo veículo.
    *   **Corpo da Requisição (Body)**: Objeto contendo os dados do veículo (id gerado no front ou omitido para autogergeração no Django).
*   `PUT /api/vehicles/<id>/`
    *   **Descrição**: Atualiza um veículo existente (inclusive alterações automáticas de quilometragem e status `disponivel`, `uso`, `manutencao`).
*   `DELETE /api/vehicles/<id>/`
    *   **Descrição**: Remove o registro do veículo.

### B. Agendamentos (`/api/bookings/`)
*   `GET /api/bookings/`
    *   **Descrição**: Retorna a lista completa com todas as reservas solicitadas.
    *   **Resposta (Exemplo)**:
        ```json
        [
          {
            "id": "b_123456",
            "vehicleId": "v_123456",
            "driverName": "Carlos Silva",
            "driverCpf": "123.456.789-00",
            "driverCnh": "98765432100",
            "driverCnhCategory": "B",
            "purpose": "Apoio Técnico",
            "startDate": "2026-06-20T08:00",
            "endDate": "2026-06-20T18:00",
            "status": "pendente",
            "notes": "Suprimentos no porta-malas.",
            "actualStartKm": null,
            "actualEndKm": null,
            "actualStartDate": null,
            "actualEndDate": null,
            "createdAt": "2026-06-18T14:00"
          }
        ]
        ```
*   `POST /api/bookings/`
    *   **Descrição**: Solicita uma nova reserva de veículo.
*   `PUT /api/bookings/<id>/`
    *   **Descrição**: Modifica ou atualiza uma reserva. É chamada para:
        1.  **Mudar status** (ex: Cancelamento).
        2.  **Iniciar Viagem** (Retirada de chaves): Recebe `status: "ativo"`, `actualStartKm` (KM de saída) e `actualStartDate` (Data/hora real de saída).
        3.  **Concluir Viagem** (Entrega de chaves): Recebe `status: "concluido"`, `actualEndKm` (KM de chegada), `actualEndDate` (Data/hora real de retorno) e anexa logs de auditoria.

### C. Manutenções (`/api/maintenance/`)
*   `GET /api/maintenance/`
    *   **Descrição**: Retorna o histórico de manutenções de todos os veículos.
    *   **Resposta (Exemplo)**:
        ```json
        [
          {
            "id": "m_123456",
            "vehicleId": "v1",
            "description": "Troca de Óleo e Filtros",
            "cost": 350.00,
            "date": "2026-06-18",
            "type": "preventiva",
            "status": "concluido",
            "notes": "Próxima troca em 10.000km."
          }
        ]
        ```
*   `POST /api/maintenance/`
    *   **Descrição**: Cria um novo registro de manutenção de veículo.
*   `PUT /api/maintenance/<id>/`
    *   **Descrição**: Altera ou atualiza o registro de manutenção de veículo.
*   `DELETE /api/maintenance/<id>/`
    *   **Descrição**: Remove uma manutenção do histórico.

---

## 🔌 7. Como Utilizar/Embutir o Plugin no HTML com jQuery

Como este plugin é construído usando **React moderno**, a compilação final gera arquivos estáticos otimizados (CSS e JavaScript unificados de alta performance). No entanto, você pode integrá-lo e controlá-lo facilmente usando o seu ecossistema jQuery tradicional!

Existem duas abordagens excelentes para injetar o painel no HTML tradicional do Django, permitindo acioná-lo de qualquer página secundária:

### Abordagem A: Injeção Direta da Aplicação (SPA no Div)
Nesta abordagem, o seu HTML possui uma tag `div` onde o React será montado de forma transparente. Com o jQuery, você pode carregar, ocultar ou abrir modais contendo este dashboard:

```html
<!-- templates/sua_pagina.html -->
{% load static %}
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Minha Aplicação Django + jQuery</title>
    <!-- Inclua o jQuery tradicional -->
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    
    <!-- CSS Compilado do React -->
    <link rel="stylesheet" href="{% static 'fleet/assets/index-XXXX.css' %}">
</head>
<body class="bg-gray-100">

    <!-- Seu Header Tradicional feito no Django/jQuery -->
    <header class="p-4 bg-white border-b flex justify-between">
        <h1 class="text-xl font-bold">Portal Administrativo</h1>
        <button id="btnToggleFleet" class="bg-blue-600 text-white px-4 py-2 rounded">
            Abrir Gestor de Frotas
        </button>
    </header>

    <div class="p-6">
        <p>Conteúdo nativo do seu Django rodando com jQuery...</p>
        
        <!-- ELEMENTO ONDE O PLUGIN REACT SERÁ MONTADO -->
        <div id="fleet-app-container" style="display: none;" class="mt-6 border rounded-2xl bg-white shadow-lg overflow-hidden">
            <div id="root"></div> <!-- O React busca este ID 'root' para renderizar -->
        </div>
    </div>

    <!-- Controle com jQuery -->
    <script>
        $(document).ready(function() {
            // Alternar exibição do plugin com jQuery
            $("#btnToggleFleet").click(function() {
                $("#fleet-app-container").slideToggle(400);
            });
            
            // Ouvir eventos despachados pelo Plugin (opcional)
            // Caso queira alertar o seu backend jQuery sobre novas reservas em tempo real:
            window.addEventListener('fleet-booking-created', function(event) {
                console.log("Novo Agendamento feito pelo Front!", event.detail);
                // Você pode usar o AJAX do jQuery para rodar alguma função dinâmica
                $.post('/sua-rota-django-jQuery/', { booking: event.detail }, function(res) {
                     alert("Página jQuery notificada do agendamento!");
                });
            });
        });
    </script>

    <!-- JS Compilado do React (Deve vir ao fim para carregar após os divs) -->
    <script src="{% static 'fleet/assets/index-XXXX.js' %}" type="module"></script>
</body>
</html>
```

### Abordagem B: Compartilhamento Isolado em `<iframe>` (Recomendado para Legados)
Se o seu app possui vários scripts jQuery complexos e você quer evitar conflitos globais de CSS, a abordagem mais segura é embutir o painel de frotas dentro de um `<iframe>` redirecionado para a View do Django que serve a página React.

Você pode manipular o Iframe e enviar instruções de abertura/fechamento usando jQuery:

```html
<!-- templates/painel_jquery.html -->
<div class="widget-section">
    <h3>Gestão de Reservas Corporativas</h3>
    
    <!-- Elemento IFrame -->
    <iframe id="fleetIframe" src="/sua-view-que-renderiza-o-plugin/" style="width: 100%; height: 650px; border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);"></iframe>
</div>

<script>
    // Se precisar chamar funções de dentro do Iframe ou escutar mensagens do Iframe com jQuery:
    $(document).ready(function() {
        // Exemplo: Ouvindo postMessage enviado pelo plugin
        window.addEventListener("message", function(event) {
            if (event.data.type === "NEW_BOOKING_ADDED") {
                console.log("Novo agendamento!", event.data.payload);
                // Executa alguma ação jQuery nativa
                $("#minha-borda-de-aviso").addClass("bg-green-100");
            }
        }, false);
    });
</script>
```

---

## ⚡ 8. Implementação Nativa em HTML Puro + JS / jQuery (Sem usar React)

Caso você prefira **não** carregar o bundle React e queira criar o formulário e a listagem de agendamento diretamente no seu próprio HTML usando jQuery (ou JavaScript Vanilla), você pode fazer as verificações em tempo real consultando os endpoints REST do Django.

Abaixo está o exemplo completo de um formulário escrito em **HTML + jQuery** que realiza a verificação de disponibilidade via API à medida que as datas são alteradas, incluindo o gerenciamento dinâmico de avisos e mensagens de sucesso/erro.

### Exemplo Completo (HTML + jQuery + Tailwind CDN)

```html
<!-- templates/reserva_nativa.html -->
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Novo Agendamento Nativo</title>
    <!-- Tailwind CSS (Opcional - Apenas para estilização elegante rápida) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- jQuery Tradicional -->
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
</head>
<body class="bg-slate-50 p-6">

    <div class="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-105 p-6">
        <h2 class="text-lg font-bold text-slate-800 mb-6">Criar Agendamento de Veículo</h2>
        
        <form id="formBooking" class="space-y-4">
            <!-- 1. Seleção de Veículo -->
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5">Veículo</label>
                <select id="vehicleId" name="vehicleId" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
                    <option value="">Selecione um veículo...</option>
                </select>
            </div>

            <!-- 2. Período -->
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1.5">Data/Hora de Retirada</label>
                    <input type="datetime-local" id="startDate" name="startDate" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1.5">Data/Hora de Devolução</label>
                    <input type="datetime-local" id="endDate" name="endDate" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
                </div>
            </div>

            <!-- 🚨 BANNER DE DISPONIBILIDADE EM TEMPO REAL -->
            <div id="statusBanner" class="hidden rounded-xl p-3.5 border text-xs">
                <!-- Conteúdo preenchido dinamicamente via JS -->
            </div>

            <!-- 3. Dados do Motorista -->
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1.5">Nome do Motorista</label>
                    <input type="text" id="driverName" name="driverName" required placeholder="Ex: João Silva" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1.5">CPF do Motorista (apenas números)</label>
                    <input type="text" id="driverCpf" name="driverCpf" required placeholder="Ex: 123.456.789-00" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1.5">CNH do Motorista</label>
                    <input type="text" id="driverCnh" name="driverCnh" required placeholder="Nº da Carteira" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1.5">Categoria CNH</label>
                    <select id="driverCnhCategory" name="driverCnhCategory" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
                        <option value="A">A</option>
                        <option value="B" selected>B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                    </select>
                </div>
            </div>

            <!-- 4. Finalidade -->
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5">Motivo / Finalidade da Viagem</label>
                <input type="text" id="purpose" name="purpose" required placeholder="Ex: Visita técnica ao cliente" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-300 focus:outline-none">
            </div>

            <!-- Botão de Envio -->
            <button type="submit" id="btnSubmit" class="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-xs font-semibold transition-colors disabled:opacity-50" disabled>
                Confirmar Agendamento
            </button>
        </form>
    </div>

    <script>
        $(document).ready(function() {
            const API_URL = '/api/bookings/'; // Altere para a URL real da sua API Django
            const VEHICLES_API_URL = '/api/vehicles/'; // Altere para a URL real da sua API Django
            
            let hasConflict = false;

            // Carrega os veículos dinamicamente ao iniciar a página
            $.getJSON(VEHICLES_API_URL, function(vehicles) {
                const $select = $('#vehicleId');
                vehicles.forEach(v => {
                    $select.append(`<option value="${v.id}">${v.brand} ${v.model} (${v.plate})</option>`);
                });
            });

            // Função para verificar conflitos via API (Sincronizada em tempo real)
            function checkAvailability() {
                const vehicleId = $('#vehicleId').val();
                const startDateStr = $('#startDate').val();
                const endDateStr = $('#endDate').val();

                // Se houver campos vazios, limpa e oculta o aviso
                if (!vehicleId || !startDateStr || !endDateStr) {
                    $('#statusBanner').removeClass().addClass('hidden');
                    $('#btnSubmit').prop('disabled', true);
                    return;
                }

                const startMs = new Date(startDateStr).getTime();
                const endMs = new Date(endDateStr).getTime();

                if (endMs <= startMs) {
                    $('#statusBanner')
                        .removeClass()
                        .addClass('bg-red-50 text-red-800 border-red-200 p-3.5 rounded-xl block border')
                        .html('<strong>Erro no período:</strong> A data de decolagem/retorno deve ser maior que a inicial.');
                    $('#btnSubmit').prop('disabled', true);
                    return;
                }

                // Exibe status de carregamento no banner
                $('#statusBanner')
                    .removeClass()
                    .addClass('bg-blue-50 text-blue-800 border-blue-200 p-3.5 rounded-xl block border animate-pulse')
                    .html('<span>Buscando informações do veículo na API...</span>');

                // Consulta a API buscando todos os agendamentos existentes para cruzar os dados
                $.getJSON(API_URL, function(bookings) {
                    // Algoritmo de cruzamento de horários (Overlap check)
                    const conflict = bookings.find(b => {
                        if (String(b.vehicleId) !== String(vehicleId)) return false;
                        if (b.status === 'cancelado') return false;

                        const bStart = new Date(b.startDate).getTime();
                        const bEnd = new Date(b.endDate).getTime();

                        return (startMs < bEnd && endMs > bStart);
                    });

                    if (conflict) {
                        hasConflict = true;
                        $('#statusBanner')
                            .removeClass()
                            .addClass('bg-amber-50 text-amber-900 border-amber-200 p-4 rounded-xl block border')
                            .html(`
                                <div class="font-bold text-amber-700 mb-1">CONFLITO DE HORÁRIO DETECTADO!</div>
                                <p class="mb-1">Este veículo já está reservado por <strong>${conflict.driverName}</strong> no período de:</p>
                                <span class="bg-white/80 border py-0.5 px-2 rounded text-[11px] font-mono">${new Date(conflict.startDate).toLocaleString()} até ${new Date(conflict.endDate).toLocaleString()}</span>
                            `);
                        $('#btnSubmit').prop('disabled', true);
                    } else {
                        hasConflict = false;
                        $('#statusBanner')
                            .removeClass()
                            .addClass('bg-emerald-50 text-emerald-800 border-emerald-200 p-3.5 rounded-xl block border')
                            .html(`
                                <div class="font-bold text-emerald-600 mb-0.5">Disponibilidade Confirmada via API!</div>
                                <span>O veículo está livre e disponível para agendamento neste período.</span>
                            `);
                        $('#btnSubmit').prop('disabled', false);
                    }
                }).fail(function() {
                    // Fallback em caso de indisponibilidade da API offline/pendente
                    $('#statusBanner')
                        .removeClass()
                        .addClass('bg-amber-50 text-amber-800 border-amber-200 p-3.5 rounded-xl block border')
                        .html('<strong>Nota:</strong> Não foi possível sincronizar com o servidor no momento. Validação offline será feita no envio.');
                    $('#btnSubmit').prop('disabled', false);
                });
            }

            // Ativa verificação em tempo real a cada mudança de campo crítico
            $('#vehicleId, #startDate, #endDate').on('change input', checkAvailability);

            // Submissão de Formulário via AJAX Post para o Django
            $('#formBooking').on('submit', function(e) {
                e.preventDefault();
                if (hasConflict) return;

                const formData = {
                    vehicleId: $('#vehicleId').val(),
                    driverName: $('#driverName').val(),
                    driverCpf: $('#driverCpf').val().replace(/\D/g, ''),
                    driverCnh: $('#driverCnh').val(),
                    driverCnhCategory: $('#driverCnhCategory').val(),
                    purpose: $('#purpose').val(),
                    startDate: $('#startDate').val(),
                    endDate: $('#endDate').val(),
                    status: 'pendente'
                };

                $.ajax({
                    url: API_URL,
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify(formData),
                    success: function(response) {
                        alert('Agendamento realizado com sucesso!');
                        window.location.reload();
                    },
                    error: function(err) {
                        alert('Erro ao processar agendamento: ' + err.responseText);
                    }
                });
            });
        });
    </script>
</body>
</html>
```

### Principais Benefícios da Abordagem em HTML + jQuery:

1. **Leveza Total:** Dispensa carregamento de bibliotecas SPA grandes ou compiladores. O navegador processa instantaneamente.
2. **Integração Perfeita com Django Forms / Django Templates:** Você pode usar as tags `{{ form.field }}` nativas do Django no lugar dos inputs tradicionais, bastando incluir as classes do Tailwind e dar os IDs jQuery apropriados.
3. **Validação Instantânea:** O evento `.on('change input')` intercepta interações do usuário imediatamente para consultar a API via `$.getJSON` antes do envio, prevenindo agendamentos duplicados de forma limpa.


