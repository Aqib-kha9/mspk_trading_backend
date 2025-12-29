import Joi from 'joi';

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().min(6), // custom regex if needed
    name: Joi.string().required(),
    phone: Joi.string().optional(),
    referralCode: Joi.string().optional(),
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required(),
    ip: Joi.string().optional(),
    sessionId: Joi.string().optional(),
  }),
};

const updateProfile = {
    body: Joi.object().keys({
        name: Joi.string(),
        phone: Joi.string(),
        profile: Joi.object().keys({
            avatar: Joi.string().uri(),
            address: Joi.string(),
            city: Joi.string(),
            state: Joi.string()
        })
    }).min(1)
};

const updateKyc = {
    body: Joi.object().keys({
        panCard: Joi.string().uri(),
        aadhaarCard: Joi.string().uri()
    }).min(1)
};

export default {
  register,
  login,
  updateProfile,
  updateKyc
};
