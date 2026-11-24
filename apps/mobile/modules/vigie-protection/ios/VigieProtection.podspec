Pod::Spec.new do |s|
  s.name           = 'VigieProtection'
  s.version        = '0.1.0'
  s.summary        = 'Vigie : partage de session et annuaire d\'appels avec les extensions iOS'
  s.description    = 'Module natif local de Vigie (App Group, CallKit Call Directory).'
  s.author         = 'Vigie'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CallKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
