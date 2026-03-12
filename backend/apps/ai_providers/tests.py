from django.test import TestCase
from django.contrib.admin.sites import AdminSite
from django.core.management import call_command
from .models import AIProvider, AIModel, CanonicalParameter, ModelParameterBinding, ModelPricingConfig
from .services import (
    create_provider,
    create_model,
    get_active_providers,
    get_active_models,
    get_provider_models,
    build_request_from_schema
)
from .compiler import (
    extract_placeholders,
    match_placeholder_to_canonical,
    compile_parameters_schema,
    compile_pricing_payload,
)
from .validators import validate_model_admin_config
from .admin import AIModelAdmin
from .admin_forms import AIModelAdminForm
from .admin_inlines import ModelParameterBindingInline
from .pricing_tools import generate_pricing_template, parse_bulk_pricing_json
from .backfill import backfill_ai_model


class AIProviderModelTest(TestCase):
    """Тесты для модели AIProvider."""
    
    def test_create_provider(self):
        """Тест создания провайдера."""
        provider = AIProvider.objects.create(
            name='Kie.ai',
            base_url='https://api.kie.ai',
            api_key='test_key',
            is_active=True
        )
        self.assertEqual(provider.name, 'Kie.ai')
        self.assertEqual(provider.base_url, 'https://api.kie.ai')
        self.assertTrue(provider.is_active)
    
    def test_provider_str(self):
        """Тест строкового представления провайдера."""
        provider = AIProvider.objects.create(
            name='Test Provider',
            base_url='https://test.com',
            is_active=True
        )
        self.assertEqual(str(provider), '✓ Test Provider')
        
        provider.is_active = False
        provider.save()
        self.assertEqual(str(provider), '✗ Test Provider')
    
    def test_provider_ordering(self):
        """Тест сортировки провайдеров по имени."""
        provider1 = AIProvider.objects.create(name='Zebra', base_url='https://z.com')
        provider2 = AIProvider.objects.create(name='Alpha', base_url='https://a.com')
        
        providers = AIProvider.objects.all()
        self.assertEqual(providers[0], provider2)
        self.assertEqual(providers[1], provider1)


class AIModelModelTest(TestCase):
    """Тесты для модели AIModel."""
    
    def setUp(self):
        """Создание тестового провайдера."""
        self.provider = AIProvider.objects.create(
            name='Kie.ai',
            base_url='https://api.kie.ai',
            is_active=True
        )
    
    def test_create_model(self):
        """Тест создания модели."""
        model = AIModel.objects.create(
            provider=self.provider,
            name='Nano Banana',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/nano-banana',
            request_schema={'prompt': '{{prompt}}'},
            parameters_schema={'width': {'type': 'select', 'options': [512, 1024]}}
        )
        self.assertEqual(model.name, 'Nano Banana')
        self.assertEqual(model.model_type, AIModel.MODEL_TYPE_IMAGE)
    
    def test_model_str(self):
        """Тест строкового представления модели."""
        model = AIModel.objects.create(
            provider=self.provider,
            name='Test Model',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/test',
            is_active=True
        )
        expected_str = '✓ Test Model (Изображение) - Kie.ai'
        self.assertEqual(str(model), expected_str)
    
    def test_get_full_url(self):
        """Тест получения полного URL."""
        model = AIModel.objects.create(
            provider=self.provider,
            name='Test Model',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/v1/generate'
        )
        self.assertEqual(model.get_full_url(), 'https://api.kie.ai/v1/generate')
        
        # Тест с trailing slash
        model.api_endpoint = 'generate'
        self.assertEqual(model.get_full_url(), 'https://api.kie.ai/generate')
    
    def test_model_related_name(self):
        """Тест обратной связи через related_name."""
        AIModel.objects.create(
            provider=self.provider,
            name='Model 1',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/m1'
        )
        AIModel.objects.create(
            provider=self.provider,
            name='Model 2',
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint='/m2'
        )
        
        self.assertEqual(self.provider.models.count(), 2)


class AIProviderServiceTest(TestCase):
    """Тесты для сервисов AI провайдеров."""
    
    def test_create_provider_service(self):
        """Тест создания провайдера через сервис."""
        provider = create_provider(
            name='OpenAI',
            base_url='https://api.openai.com',
            api_key='sk-test',
            is_active=True
        )
        self.assertEqual(provider.name, 'OpenAI')
        self.assertTrue(provider.is_active)
    
    def test_get_active_providers(self):
        """Тест получения активных провайдеров."""
        create_provider('Active', 'https://active.com', is_active=True)
        create_provider('Inactive', 'https://inactive.com', is_active=False)
        
        active = get_active_providers()
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].name, 'Active')


class AIModelServiceTest(TestCase):
    """Тесты для сервисов AI моделей."""
    
    def setUp(self):
        """Создание тестового провайдера."""
        self.provider = create_provider(
            name='Kie.ai',
            base_url='https://api.kie.ai',
            is_active=True
        )
    
    def test_create_model_service(self):
        """Тест создания модели через сервис."""
        model = create_model(
            provider=self.provider,
            name='Nano Banana',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/nano-banana',
            request_schema={'prompt': '{{prompt}}', 'width': '{{width}}'},
            parameters_schema={
                'width': {'type': 'select', 'options': [512, 1024], 'default': 1024}
            }
        )
        self.assertEqual(model.name, 'Nano Banana')
        self.assertIn('prompt', model.request_schema)
        self.assertIn('width', model.parameters_schema)
    
    def test_get_active_models(self):
        """Тест получения активных моделей."""
        create_model(
            self.provider, 'Active Image', AIModel.MODEL_TYPE_IMAGE, '/img', is_active=True
        )
        create_model(
            self.provider, 'Inactive Video', AIModel.MODEL_TYPE_VIDEO, '/vid', is_active=False
        )
        
        active = get_active_models()
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].name, 'Active Image')
    
    def test_get_active_models_filtered(self):
        """Тест получения активных моделей с фильтром."""
        create_model(
            self.provider, 'Image 1', AIModel.MODEL_TYPE_IMAGE, '/img1', is_active=True
        )
        create_model(
            self.provider, 'Video 1', AIModel.MODEL_TYPE_VIDEO, '/vid1', is_active=True
        )
        
        images = get_active_models(model_type=AIModel.MODEL_TYPE_IMAGE)
        videos = get_active_models(model_type=AIModel.MODEL_TYPE_VIDEO)
        
        self.assertEqual(len(images), 1)
        self.assertEqual(len(videos), 1)
    
    def test_get_provider_models(self):
        """Тест получения всех моделей провайдера."""
        create_model(self.provider, 'Model 1', AIModel.MODEL_TYPE_IMAGE, '/m1')
        create_model(self.provider, 'Model 2', AIModel.MODEL_TYPE_VIDEO, '/m2')
        
        models = get_provider_models(self.provider)
        self.assertEqual(len(models), 2)
    
    def test_build_request_from_schema(self):
        """Тест построения запроса из схемы."""
        model = create_model(
            self.provider,
            'Test Model',
            AIModel.MODEL_TYPE_IMAGE,
            '/test',
            request_schema={
                'prompt': '{{prompt}}',
                'width': '{{width}}',
                'height': '{{height}}',
                'steps': '{{steps}}'
            }
        )
        
        parameters = {
            'prompt': 'A beautiful sunset',
            'width': 1024,
            'height': 768,
            'steps': 30
        }
        
        request = build_request_from_schema(model, parameters)
        
        self.assertEqual(request['prompt'], 'A beautiful sunset')
        self.assertEqual(request['width'], 1024)
        self.assertEqual(request['height'], 768)
        self.assertEqual(request['steps'], 30)

class AIModelContractBoundaryTest(TestCase):
    """Контрактные тесты для границы legacy/compiled schema."""

    def setUp(self):
        self.provider = AIProvider.objects.create(
            name='Boundary Provider',
            base_url='https://boundary.example.com',
            is_active=True,
        )

    def test_model_detects_compiled_parameters_schema_list(self):
        model = AIModel.objects.create(
            provider=self.provider,
            name='Compiled Model',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/compiled',
            parameters_schema=[
                {
                    'request_key': 'resolution',
                    'label': 'Resolution',
                    'ui_semantic': 'resolution',
                }
            ],
            pricing_schema={'fixed_cost': '5.00'},
        )

        self.assertEqual(model.get_parameters_schema_source(), AIModel.PARAMETERS_SCHEMA_SOURCE_COMPILED)
        self.assertTrue(model.has_compiled_parameters_schema())
        self.assertFalse(model.has_legacy_parameters_schema())

    def test_model_detects_legacy_parameters_schema_dict(self):
        legacy_schema = {
            'width': {'type': 'select', 'options': [512, 1024], 'default': 1024}
        }
        model = AIModel.objects.create(
            provider=self.provider,
            name='Legacy Model',
            model_type=AIModel.MODEL_TYPE_IMAGE,
            api_endpoint='/legacy',
            parameters_schema=legacy_schema,
            pricing_schema={'fixed_cost': '5.00'},
        )

        self.assertEqual(model.get_parameters_schema_source(), AIModel.PARAMETERS_SCHEMA_SOURCE_LEGACY)
        self.assertTrue(model.has_legacy_parameters_schema())
        self.assertFalse(model.has_compiled_parameters_schema())

    def test_create_model_preserves_compiled_parameters_schema_shape(self):
        compiled_schema = [
            {
                'request_key': 'duration',
                'label': 'Duration',
                'ui_semantic': 'duration',
                'options': [{'value': 5, 'label': '5 sec'}],
                'default': 5,
            }
        ]

        model = create_model(
            provider=self.provider,
            name='Compiled Through Service',
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint='/video',
            parameters_schema=compiled_schema,
            request_schema={'duration': '{{duration}}'},
        )

        self.assertEqual(model.parameters_schema, compiled_schema)
        self.assertEqual(model.get_parameters_schema_source(), AIModel.PARAMETERS_SCHEMA_SOURCE_COMPILED)


class AIModelNormalizedEntitiesTest(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(
            name='Normalized Provider',
            base_url='https://normalized.example.com',
            is_active=True,
        )
        self.model = AIModel.objects.create(
            provider=self.provider,
            name='Normalized Model',
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint='/normalized',
            request_schema={'duration': '{{duration}}'},
            pricing_schema={'fixed_cost': '4.00'},
        )

    def test_create_canonical_parameter_with_aliases(self):
        parameter = CanonicalParameter.objects.create(
            code='duration',
            ui_semantic='duration',
            value_type='enum',
            aliases=['videoDuration', 'durationSeconds'],
            default_ui_control='select',
        )

        self.assertEqual(parameter.code, 'duration')
        self.assertIn('videoDuration', parameter.aliases)

    def test_create_model_parameter_binding(self):
        parameter = CanonicalParameter.objects.create(
            code='duration',
            ui_semantic='duration',
            value_type='enum',
            aliases=['videoDuration'],
            default_ui_control='select',
        )

        binding = ModelParameterBinding.objects.create(
            ai_model=self.model,
            canonical_parameter=parameter,
            placeholder='duration',
            request_path='duration',
            default_override=5,
            is_advanced=False,
            sort_order=10,
        )

        self.assertEqual(binding.ai_model, self.model)
        self.assertEqual(binding.canonical_parameter, parameter)
        self.assertEqual(binding.placeholder, 'duration')

    def test_create_model_pricing_config(self):
        pricing = ModelPricingConfig.objects.create(
            ai_model=self.model,
            mode=ModelPricingConfig.MODE_LOOKUP,
            dimensions=['resolution', 'duration'],
            raw_lookup={'720p|5': '3.00', '1080p|10': '7.50'},
            compiled_payload={'cost_params': ['resolution', 'duration'], 'costs': {'720p|5': '3.00'}},
        )

        self.assertEqual(pricing.mode, ModelPricingConfig.MODE_LOOKUP)
        self.assertEqual(pricing.dimensions, ['resolution', 'duration'])
        self.assertIn('720p|5', pricing.raw_lookup)


class AIModelCompilerPipelineTest(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(
            name='Compiler Provider',
            base_url='https://compiler.example.com',
            is_active=True,
        )
        self.model = AIModel.objects.create(
            provider=self.provider,
            name='Compiler Model',
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint='/compiler',
            request_schema={
                'prompt': '{{prompt}}',
                'duration': '{{videoDuration}}',
                'metadata': {'resolution': '{{resolution}}'},
            },
            pricing_schema={'fixed_cost': '5.00'},
        )
        self.duration = CanonicalParameter.objects.create(
            code='duration',
            ui_semantic='duration',
            value_type='enum',
            aliases=['videoDuration'],
            default_ui_control='select',
            base_options=[{'value': 5, 'label': '5 sec'}, {'value': 10, 'label': '10 sec'}],
        )
        self.resolution = CanonicalParameter.objects.create(
            code='resolution',
            ui_semantic='resolution',
            value_type='enum',
            aliases=['size'],
            default_ui_control='toggle_group',
            base_options=[{'value': '720p', 'label': '720p'}, {'value': '1080p', 'label': '1080p'}],
        )

    def test_extract_placeholders_from_request_schema(self):
        placeholders = extract_placeholders(self.model.request_schema)
        self.assertEqual(placeholders, {'prompt', 'videoDuration', 'resolution'})

    def test_match_placeholder_to_canonical_uses_alias(self):
        matched = match_placeholder_to_canonical('videoDuration', self.model.model_type)
        self.assertEqual(matched, self.duration)

    def test_compile_parameters_schema_from_bindings(self):
        ModelParameterBinding.objects.create(
            ai_model=self.model,
            canonical_parameter=self.duration,
            placeholder='videoDuration',
            request_path='duration',
            default_override=5,
            sort_order=20,
        )
        ModelParameterBinding.objects.create(
            ai_model=self.model,
            canonical_parameter=self.resolution,
            placeholder='resolution',
            request_path='metadata.resolution',
            options_override=[{'value': '1080p', 'label': 'Full HD'}],
            sort_order=10,
        )

        compiled = compile_parameters_schema(self.model)

        self.assertEqual(compiled[0]['request_key'], 'resolution')
        self.assertEqual(compiled[0]['ui_semantic'], 'resolution')
        self.assertEqual(compiled[1]['request_key'], 'videoDuration')
        self.assertEqual(compiled[1]['default'], 5)

    def test_compile_pricing_payload_from_model_pricing_config(self):
        ModelParameterBinding.objects.create(
            ai_model=self.model,
            canonical_parameter=self.duration,
            placeholder='videoDuration',
            request_path='duration',
            sort_order=10,
        )
        ModelParameterBinding.objects.create(
            ai_model=self.model,
            canonical_parameter=self.resolution,
            placeholder='resolution',
            request_path='metadata.resolution',
            sort_order=20,
        )
        ModelPricingConfig.objects.create(
            ai_model=self.model,
            mode=ModelPricingConfig.MODE_LOOKUP,
            dimensions=['resolution', 'duration'],
            raw_lookup={'720p|5': '3.00'},
        )

        pricing_payload = compile_pricing_payload(self.model)

        self.assertEqual(pricing_payload['cost_params'], ['resolution', 'duration'])
        self.assertEqual(pricing_payload['costs']['720p|5'], '3.00')

    def test_validate_model_admin_config_rejects_unresolved_placeholder(self):
        with self.assertRaisesMessage(ValueError, 'Плейсхолдер "videoDuration" не связан с каноническим параметром.'):
            validate_model_admin_config(self.model)

    def test_validate_model_admin_config_rejects_unbound_pricing_dimension(self):
        self.model.request_schema = {
            'prompt': '{{prompt}}',
            'duration': '{{videoDuration}}',
        }
        self.model.save(update_fields=['request_schema'])
        ModelParameterBinding.objects.create(
            ai_model=self.model,
            canonical_parameter=self.duration,
            placeholder='videoDuration',
            request_path='duration',
            sort_order=10,
        )
        ModelPricingConfig.objects.create(
            ai_model=self.model,
            mode=ModelPricingConfig.MODE_LOOKUP,
            dimensions=['resolution', 'duration'],
            raw_lookup={'720p|5': '3.00'},
        )

        with self.assertRaisesMessage(ValueError, 'Параметр pricing "resolution" не подключён к модели.'):
            validate_model_admin_config(self.model)


class AIModelAdminWorkflowTest(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(
            name='Admin Provider',
            base_url='https://admin.example.com',
            is_active=True,
        )
        self.site = AdminSite()

    def test_ai_model_admin_uses_workflow_fieldsets(self):
        admin = AIModelAdmin(AIModel, self.site)
        fieldset_titles = [title for title, _options in admin.fieldsets]

        self.assertEqual(
            fieldset_titles,
            [
                'Model Identity',
                'Request Mapping',
                'UI Parameter Overrides',
                'Pricing',
                'Advanced Mode',
                'Compiled Preview',
                'Timestamps',
            ],
        )

    def test_ai_model_admin_includes_parameter_binding_inline(self):
        admin = AIModelAdmin(AIModel, self.site)
        self.assertIn(ModelParameterBindingInline, admin.inlines)

    def test_ai_model_admin_form_rejects_unbound_placeholder(self):
        model = AIModel.objects.create(
            provider=self.provider,
            name='Broken Model',
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint='/broken',
            request_schema={'duration': '{{videoDuration}}'},
            pricing_schema={'fixed_cost': '5.00'},
        )

        form = AIModelAdminForm(
            data={
                'provider': self.provider.id,
                'name': model.name,
                'model_type': model.model_type,
                'api_endpoint': model.api_endpoint,
                'request_schema': '{"duration": "{{videoDuration}}"}',
                'parameters_schema': '[]',
                'preview_url': '',
                'description': '',
                'tags': '[]',
                'image_inputs_schema': '[]',
                'pricing_schema': '{"fixed_cost": "5.00"}',
                'is_active': True,
            },
            instance=model,
        )

        self.assertFalse(form.is_valid())
        self.assertIn('Плейсхолдер "videoDuration" не связан с каноническим параметром.', form.errors['request_schema'][0])


class PricingToolsTest(TestCase):
    def test_generate_pricing_template_from_dimensions(self):
        payload = generate_pricing_template(
            ["resolution", "duration"],
            {
                "resolution": ["720p", "1080p"],
                "duration": [5, 10],
            },
        )

        self.assertIn("720p|5", payload["costs"])
        self.assertIn("1080p|10", payload["costs"])

    def test_parse_bulk_pricing_json_accepts_large_lookup_matrix(self):
        payload = parse_bulk_pricing_json(
            '{"cost_params": ["resolution", "duration"], "costs": {"720p|5": "3.00", "1080p|10": "7.00"}}',
            dimensions=["resolution", "duration"],
            allowed_values={"resolution": ["720p", "1080p"], "duration": [5, 10]},
        )

        self.assertEqual(payload["costs"]["1080p|10"], "7.00")

    def test_parse_bulk_pricing_json_rejects_invalid_lookup_key(self):
        with self.assertRaisesMessage(ValueError, 'Некорректный ключ pricing lookup: "720p".'):
            parse_bulk_pricing_json(
                '{"cost_params": ["resolution", "duration"], "costs": {"720p": "3.00"}}',
                dimensions=["resolution", "duration"],
                allowed_values={"resolution": ["720p"], "duration": [5]},
            )

    def test_parse_bulk_pricing_json_rejects_unknown_dimension_value(self):
        with self.assertRaisesMessage(ValueError, 'Недопустимое значение "4k" для dimension "resolution".'):
            parse_bulk_pricing_json(
                '{"cost_params": ["resolution", "duration"], "costs": {"4k|5": "9.00"}}',
                dimensions=["resolution", "duration"],
                allowed_values={"resolution": ["720p", "1080p"], "duration": [5]},
            )


class AIModelBackfillTest(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(
            name='Backfill Provider',
            base_url='https://backfill.example.com',
            is_active=True,
        )

    def test_backfill_legacy_model_into_bindings(self):
        model = AIModel.objects.create(
            provider=self.provider,
            name='Legacy Backfill',
            model_type=AIModel.MODEL_TYPE_VIDEO,
            api_endpoint='/legacy',
            request_schema={
                'prompt': '{{prompt}}',
                'duration': '{{duration}}',
                'resolution': '{{resolution}}',
            },
            parameters_schema={
                'duration': {'type': 'select', 'options': [5, 10], 'default': 5},
                'resolution': {'type': 'select', 'options': ['720p', '1080p'], 'default': '720p'},
            },
            pricing_schema={'cost_params': ['resolution', 'duration'], 'costs': {'720p|5': '3.00'}},
        )

        backfill_ai_model(model)

        self.assertEqual(model.parameter_bindings.count(), 2)
        self.assertTrue(CanonicalParameter.objects.filter(code='duration').exists())
        self.assertEqual(model.pricing_config.mode, ModelPricingConfig.MODE_LOOKUP)

    def test_setup_kie_ai_creates_normalized_records(self):
        call_command('setup_kie_ai')

        seedance = AIModel.objects.get(name='Seedance 1.5 Pro')
        nano = AIModel.objects.get(name='Nano Banana')

        self.assertGreaterEqual(seedance.parameter_bindings.count(), 3)
        self.assertGreaterEqual(nano.parameter_bindings.count(), 3)
        self.assertTrue(hasattr(seedance, 'pricing_config'))
