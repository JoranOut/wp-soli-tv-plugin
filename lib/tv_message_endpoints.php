<?php

add_action('rest_api_init', 'soli_tv_api', 10, 1);
function soli_tv_api() {
  buildGETCurrentTVMessages();
  buildGETSingleTVMessage();
  buildPOSTPersistTVMessage();
}

function buildGETCurrentTVMessages() {
    register_rest_route('soli_tv/v1', '/messages', array(
        'methods' => 'GET',
        'permission_callback' => '__return_true', // *always set a permission callback
        'callback' => function ($request) {
            $tvMessageHandler = new \Soli\TV\TVMessageTableHandler();
            $messages = $tvMessageHandler->getTVMessages();
            $response = new WP_REST_Response($messages);
            if (!$messages) {
                $response->set_status(204);
            } else {
                $response->set_status(200);
            }
            return $response;
        },
    ));
}

function buildGETSingleTVMessage(){
    register_rest_route('soli_tv/v1', '/message/(?P<id>\d+)', array(
        'methods' => 'GET',
        'permission_callback' => '__return_true', // *always set a permission callback
        'callback' => function ($request) {
            $tvMessageHandler = new \Soli\TV\TVMessageTableHandler();
            $message = $tvMessageHandler->getSingleTVMessage($request['id']);
            $response = new WP_REST_Response($message);
            if (!$message) {
                $response->set_status(204);
            } else {
                $response->set_status(200);
            }
            return $response;
        },
    ));
}

function buildPOSTPersistTVMessage() {
  register_rest_route('soli_tv/v1', '/message(?:/(?P<id>\d+))?', array(
    'methods' => 'POST',
    'permission_callback' => function () {
      return current_user_can('edit_posts');
    }, // *always set a permission callback
    'callback' => function ($request) {
      $tvMessageHandler = new \Soli\TV\TVMessageTableHandler();
      $body = json_decode($request->get_body());

      if (!isset($body->title)
            || !isset($body->content)
            || !isset($body->type)
            || !isset($body->start_date)
            || !isset($body->end_date)
            || !isset($body->status)
            || !in_array($body->status, ['draft', 'published', 'archived'])
      ) {
        return new WP_REST_Response(array(
          'code' => WP_REST_Server::INVALID_ARGUMENT,
          'message' => 'Invalid request arguments.',
        ), 400);
      }

      $message = $tvMessageHandler->persistMessage($request['id'], $body);
      $response = new WP_REST_Response($message);
      if (!$message) {
        $response->set_status(204);
      } else {
        $response->set_status(200);
      }
      return $response;
    },
  ));
}
