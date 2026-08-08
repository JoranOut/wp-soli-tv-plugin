<?php

/*
add_action('rest_api_init', 'register_featured_image_options_endpoint');
function register_featured_image_options_endpoint() {
  register_rest_route('soli_featured_image/v1', '/options', array(
    'methods' => 'GET',
    'permission_callback' => '__return_true', // *always set a permission callback
    'callback' => 'get_featured_image_options',
  ));
}

function get_featured_image_options() {
  $options = get_option('featured_image_options', array());
  return rest_ensure_response($options);
}

function register_update_featured_image_options_endpoint() {
  register_rest_route('soli_featured_image/v1', '/update', array(
    'methods' => 'POST',
    'callback' => 'update_featured_image_options',
    'permission_callback' => function () {
      return current_user_can('edit_posts');
    },
  ));
}

function update_featured_image_options($request) {
  $options = json_decode($request->get_body(), true);

  if (!is_array($options)) {
    return new WP_Error('invalid_data', 'Invalid data provided', array('status' => 400));
  }

  $sanitized_options = array();

  foreach ($options as $option) {
    if (isset($option['label']) && isset($option['value'])) {
      $sanitized_options[] = array(
        'label' => sanitize_text_field($option['label']),
        'value' => sanitize_text_field($option['value'])
      );
    } else {
      return new WP_Error('invalid_data', 'Each option must have a label and a value', array('status' => 400));
    }
  }

  update_option('featured_image_options', $sanitized_options);

  return rest_ensure_response($sanitized_options);
}

add_action('rest_api_init', 'register_update_featured_image_options_endpoint');
*/